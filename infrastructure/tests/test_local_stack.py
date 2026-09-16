"""Invariants of the local docker-compose stack's own definition.

These are text assertions rather than parsed-YAML ones, deliberately. Parsing the
compose file would mean adding PyYAML, and infrastructure/CONVENTIONS.md's Composition
and dependencies section makes adding a Python package an architect decision rather than
a specialist's. Raised in LET-119's completion report instead of decided here.

What is guarded is narrow on purpose: the handful of settings whose loss would break an
acceptance criterion without breaking anything loudly. A floating image tag, a lost
proxy rule, a Keycloak volume that makes the realm survive a teardown, or an HTTPS port
on the API are each a silent failure that reads as a bug somewhere else.
"""

import re
from pathlib import Path

LOCAL_DIR = Path(__file__).resolve().parents[1] / "local"
COMPOSE_FILE = LOCAL_DIR / "docker-compose.yml"
NGINX_CONF = LOCAL_DIR / "web" / "nginx.conf"
API_DOCKERFILE = LOCAL_DIR / "api.Dockerfile"
WEB_DOCKERFILE = LOCAL_DIR / "web.Dockerfile"

PROVISIONED_FILES = (COMPOSE_FILE, NGINX_CONF, API_DOCKERFILE, WEB_DOCKERFILE)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _effective(path: Path) -> str:
    """The file with its comments stripped.

    Every assertion below runs against this rather than the raw text. These files carry
    a lot of prose explaining which settings must *not* be present, and a plain substring
    check cannot tell "ASPNETCORE_HTTPS_PORTS must never be set here" in a comment from
    the setting actually being set. Stripping comments also strengthens the positive
    assertions: a directive merely mentioned in a comment no longer satisfies them.
    """
    lines: list[str] = []
    for raw in _read(path).splitlines():
        if raw.lstrip().startswith("#"):
            continue
        marker = raw.find(" #")
        lines.append(raw[:marker] if marker != -1 else raw)
    return "\n".join(lines)


class TestFilesExist:
    def test_every_provisioned_file_is_present(self) -> None:
        missing = [path.name for path in PROVISIONED_FILES if not path.is_file()]
        assert missing == []

    def test_the_realm_export_is_present(self) -> None:
        # A realm configured only through the admin console does not satisfy LET-119.
        assert (LOCAL_DIR / "keycloak" / "team-targe-realm.json").is_file()


class TestImagePinning:
    def test_no_image_floats_on_latest(self) -> None:
        # The API targets net10.0 and the SDK was absent from at least one environment
        # (LET-112). A floating tag turns that into a restore error reading like a code
        # problem, so every base image here is pinned to a major.
        for path in PROVISIONED_FILES:
            assert ":latest" not in _effective(path), f"{path.name} pins an image to :latest"

    def test_keycloak_is_pinned(self) -> None:
        assert "quay.io/keycloak/keycloak:26.0" in _effective(COMPOSE_FILE)

    def test_dotnet_images_are_pinned_to_ten(self) -> None:
        content = _effective(API_DOCKERFILE)
        assert "mcr.microsoft.com/dotnet/sdk:10.0" in content
        assert "mcr.microsoft.com/dotnet/aspnet:10.0" in content


class TestPorts:
    def test_frontend_is_served_on_4200(self) -> None:
        # Keeps e2e/playwright.config.ts's existing baseURL valid with no change.
        assert '"4200:80"' in _effective(COMPOSE_FILE)

    def test_keycloak_is_served_on_8080(self) -> None:
        # The authority appsettings.json already configures.
        assert '"8080:8080"' in _effective(COMPOSE_FILE)

    def test_api_is_published_on_a_fixed_port(self) -> None:
        # Reachable directly for the ng serve inner loop, even though web proxies it.
        assert '"5080:8080"' in _effective(COMPOSE_FILE)


class TestRealmImport:
    def test_the_realm_is_imported_at_container_start(self) -> None:
        content = _effective(COMPOSE_FILE)
        assert "--import-realm" in content
        assert "/opt/keycloak/data/import/team-targe-realm.json" in content

    def test_keycloak_keeps_no_state_across_a_teardown(self) -> None:
        # The realm has to be identical after a down/up. Keycloak's dev mode holds its
        # embedded store inside the container, so the guarantee is simply that nothing
        # persists it -- no named volume, and no mount of its data directory.
        content = _effective(COMPOSE_FILE)
        assert re.search(r"^volumes:", content, re.MULTILINE) is None, "a top-level volume would outlive the stack"
        assert "/opt/keycloak/data/h2" not in content
        assert ":/opt/keycloak/data\n" not in content

    def test_the_realm_file_is_mounted_read_only(self) -> None:
        # So a container cannot rewrite the committed export.
        assert "team-targe-realm.json:ro" in _effective(COMPOSE_FILE)


class TestApiConfiguration:
    def test_the_authority_is_overridden_for_the_container_network(self) -> None:
        # appsettings.json configures http://localhost:8080, which inside the api
        # container is the API itself rather than Keycloak.
        assert 'Identity__Authority: "http://id:8080"' in _effective(COMPOSE_FILE)

    def test_the_realm_and_client_are_not_duplicated_in_compose(self) -> None:
        # They are correct in appsettings.json. Repeating them here would let this file
        # silently override a deliberate change to it.
        content = _effective(COMPOSE_FILE)
        assert "Identity__Realm" not in content
        assert "Identity__ClientId" not in content

    def test_no_https_port_is_configured(self) -> None:
        # Program.cs calls UseHttpsRedirection() unconditionally. With no HTTPS port
        # discoverable it passes requests through; set one and every proxied request
        # starts answering 307.
        for path in (API_DOCKERFILE, COMPOSE_FILE):
            assert "ASPNETCORE_HTTPS_PORTS" not in _effective(path)
            assert "ASPNETCORE_URLS" not in _effective(path)


class TestBuildContexts:
    def test_contexts_point_at_the_surfaces_being_built(self) -> None:
        # The Dockerfiles live here; only the build contexts reach into the other
        # surfaces, which is what keeps this story inside one surface.
        content = _effective(COMPOSE_FILE)
        assert "context: ../../backend" in content
        assert "context: ../../frontend" in content

    def test_dockerfiles_are_referenced_from_this_surface(self) -> None:
        content = _effective(COMPOSE_FILE)
        assert "dockerfile: ../infrastructure/local/api.Dockerfile" in content
        assert "dockerfile: ../infrastructure/local/web.Dockerfile" in content


class TestFrontendBuild:
    def test_the_frontend_is_production_built(self) -> None:
        # e2e/CONVENTIONS.md's Scope requires this surface to be exercised
        # production-built, not via the dev server.
        assert "--configuration production" in _effective(WEB_DOCKERFILE)

    def test_the_built_bundle_is_served_from_the_angular_output_path(self) -> None:
        assert "/src/dist/point-of-sale-ui/browser" in _effective(WEB_DOCKERFILE)


class TestProxyRule:
    def test_v1_is_routed_to_the_api(self) -> None:
        # What makes the composed stack same-origin and removes CORS from the equation.
        content = _effective(NGINX_CONF)
        assert "location /v1/" in content
        assert "http://api:8080" in content

    def test_the_proxied_uri_is_preserved(self) -> None:
        # Once proxy_pass contains a variable, nginx stops appending the matched URI;
        # without $request_uri every call arrives at the API as "/".
        assert "proxy_pass $api_upstream$request_uri;" in _effective(NGINX_CONF)

    def test_upstream_resolution_is_deferred_to_request_time(self) -> None:
        # With a literal hostname nginx resolves once at startup and refuses to start if
        # `api` is not yet resolvable, taking the web service down with it.
        assert "resolver 127.0.0.11" in _effective(NGINX_CONF)

    def test_spa_deep_links_fall_through_to_index(self) -> None:
        # The Angular router owns every non-/v1 path; without this, a reload on /login
        # or a return-url redirect into a guarded route answers 404.
        assert "try_files $uri $uri/ /index.html;" in _effective(NGINX_CONF)

    def test_the_proxy_outlives_the_apis_own_authority_timeout(self) -> None:
        # KeycloakOptions.Timeout is 5s. If nginx gives up first the developer sees a 504
        # instead of the API's own "authority unreachable" answer -- the distinct message
        # LET-118 exists to make observable.
        assert "proxy_read_timeout 30s;" in _effective(NGINX_CONF)

    def test_no_dev_server_proxy_is_introduced_here(self) -> None:
        # LET-121 owns the ng serve inner loop. This story must not touch angular.json
        # or add a proxy.config.json.
        assert not (LOCAL_DIR.parents[1] / "frontend" / "proxy.config.json").exists()
