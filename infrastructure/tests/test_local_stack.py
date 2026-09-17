"""Invariants of the local docker-compose stack's own definition.

The compose file is *parsed* here, with `yaml.safe_load`, and every assertion about it
runs against the resulting structure rather than the file's text. LET-119 wrote these as
text assertions deliberately -- parsing meant adding PyYAML, and infrastructure/
CONVENTIONS.md's Composition and dependencies section makes adding a Python package an
architect decision rather than a specialist's. That approval came on 2026-09-16, and
LET-128 spends it.

The difference is not cosmetic. LET-119 reported a test that failed on first run because
a substring check for `ASPNETCORE_HTTPS_PORTS` matched the comment explaining why that
setting must never be present. Stripping comments fixed it, but a text assertion still
cannot tell a real key from a mention of one, cannot tell a value from a substring of
another value, and keeps passing when a key moves to a different service. Parsing removes
the whole class: every assertion below is anchored to the service it belongs to, so
relocating a setting fails a test instead of sliding past a whole-file search.

The Dockerfiles and nginx.conf are not YAML and stay text assertions, still read through
`_effective` so a directive merely mentioned in a comment does not satisfy them.

What is guarded is narrow on purpose: the handful of settings whose loss would break an
acceptance criterion without breaking anything loudly. A floating image tag, a lost proxy
rule, a Keycloak volume that makes the realm survive a teardown, or an HTTPS port on the
API are each a silent failure that reads as a bug somewhere else.
"""

from pathlib import Path
from typing import Any, cast

import pytest
import yaml

LOCAL_DIR = Path(__file__).resolve().parents[1] / "local"
COMPOSE_FILE = LOCAL_DIR / "docker-compose.yml"
NGINX_CONF = LOCAL_DIR / "web" / "nginx.conf"
API_DOCKERFILE = LOCAL_DIR / "api.Dockerfile"
WEB_DOCKERFILE = LOCAL_DIR / "web.Dockerfile"
REALM_EXPORT = LOCAL_DIR / "keycloak" / "team-targe-realm.json"

PROVISIONED_FILES = (COMPOSE_FILE, NGINX_CONF, API_DOCKERFILE, WEB_DOCKERFILE)

# The files that are not YAML, and so are still asserted against as text.
TEXT_ASSERTED_FILES = (NGINX_CONF, API_DOCKERFILE, WEB_DOCKERFILE)

EXPECTED_SERVICES = frozenset({"id", "api", "web"})

# Where --import-realm looks, and the directory whose persistence would defeat it.
REALM_IMPORT_TARGET = "/opt/keycloak/data/import/team-targe-realm.json"
KEYCLOAK_DATA_DIR = "/opt/keycloak/data"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _effective(path: Path) -> str:
    """The file with its comments stripped.

    Only the non-YAML files need this now; the compose file gets the stronger treatment
    of being parsed. These files still carry prose explaining which settings must *not*
    be present, and a plain substring check cannot tell "ASPNETCORE_HTTPS_PORTS must
    never be set here" in a comment from the setting actually being set.
    """
    lines: list[str] = []
    for raw in _read(path).splitlines():
        if raw.lstrip().startswith("#"):
            continue
        marker = raw.find(" #")
        lines.append(raw[:marker] if marker != -1 else raw)
    return "\n".join(lines)


def _environment(service: dict[str, Any]) -> dict[str, str | None]:
    """A service's environment as a mapping, whichever of compose's two forms it uses.

    Compose accepts either a mapping (`KEY: value`) or a list (`- KEY=value`). Both
    normalise here so no assertion depends on which the file happens to use today.

    The `None` matters. `- KEY` with no `=` declares a key to be passed through from the
    host, and `KEY:` with no value is an empty string. Both are *present*, and the
    ASPNETCORE_HTTPS_PORTS assertion depends on absence specifically -- it must not be
    satisfied by a key that is there holding nothing.
    """
    raw = service.get("environment")
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return {str(key): None if value is None else str(value) for key, value in raw.items()}
    environment: dict[str, str | None] = {}
    for entry in cast(list[Any], raw):
        name, separator, value = str(entry).partition("=")
        environment[name] = value if separator else None
    return environment


def _published_ports(service: dict[str, Any]) -> dict[str, str]:
    """A service's published ports as {host: container}, both as strings.

    Compose's short syntax is a string -- `"4200:80"`, quoted because an unquoted
    `5080:8080` is a sexagesimal integer in YAML 1.1, not the pair it looks like. The
    long syntax is a mapping whose `published`/`target` come back as ints. Normalising
    everything to `str` keeps an assertion from passing a type check and then failing at
    runtime because it compared against an int.
    """
    published: dict[str, str] = {}
    for entry in cast(list[Any], service.get("ports", [])):
        if isinstance(entry, dict):
            mapping = cast(dict[str, Any], entry)
            if "published" in mapping:
                published[str(mapping["published"])] = str(mapping["target"])
            continue
        # "80", "4200:80", or "127.0.0.1:4200:80"; the container port may carry "/tcp".
        parts = str(entry).split("/")[0].split(":")
        if len(parts) >= 2:
            published[parts[-2]] = parts[-1]
    return published


def _mounts(service: dict[str, Any]) -> list[tuple[str, str, str]]:
    """A service's volumes as (source, target, mode), in either of compose's two forms.

    An anonymous volume declares a target only, and comes back with an empty source --
    which is exactly the shape the no-persistence assertion needs to be able to see.
    """
    mounts: list[tuple[str, str, str]] = []
    for entry in cast(list[Any], service.get("volumes", [])):
        if isinstance(entry, dict):
            mapping = cast(dict[str, Any], entry)
            mode = "ro" if mapping.get("read_only") else ""
            mounts.append((str(mapping.get("source", "")), str(mapping["target"]), mode))
            continue
        parts = str(entry).split(":")
        if len(parts) == 1:
            mounts.append(("", parts[0], ""))
        elif len(parts) == 2:
            mounts.append((parts[0], parts[1], ""))
        else:
            mounts.append((parts[0], parts[1], parts[2]))
    return mounts


@pytest.fixture(scope="module")
def compose() -> dict[str, Any]:
    """The parsed compose file.

    `safe_load`, never `load`. This file is committed and trusted, but the habit is the
    point -- and ruff would be right to flag the unsafe call regardless.
    """
    with COMPOSE_FILE.open(encoding="utf-8") as handle:
        return cast(dict[str, Any], yaml.safe_load(handle))


@pytest.fixture(scope="module")
def services(compose: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return cast(dict[str, dict[str, Any]], compose["services"])


class TestFilesExist:
    def test_every_provisioned_file_is_present(self) -> None:
        missing = [path.name for path in PROVISIONED_FILES if not path.is_file()]
        assert missing == []

    def test_the_realm_export_is_present(self) -> None:
        # A realm configured only through the admin console does not satisfy LET-119.
        assert REALM_EXPORT.is_file()


class TestServices:
    def test_the_stack_defines_exactly_the_three_expected_services(self, services: dict[str, Any]) -> None:
        # Exactly, not merely at least. The compose file's own header commits to there
        # being no database service, and there never being one -- every endpoint's data
        # comes from an in-memory store (CLAUDE.md, backend/CONVENTIONS.md).
        assert set(services) == EXPECTED_SERVICES

    @pytest.mark.parametrize("name", sorted(EXPECTED_SERVICES))
    def test_every_service_is_on_the_one_network(self, services: dict[str, Any], name: str) -> None:
        # The API reaches Keycloak as http://id:8080 and nginx reaches http://api:8080,
        # both by compose's DNS. A service off the network resolves neither.
        assert cast(list[str], services[name]["networks"]) == ["tarjay"]

    @pytest.mark.parametrize("name", sorted(EXPECTED_SERVICES))
    def test_every_service_either_pins_an_image_or_builds_one(self, services: dict[str, Any], name: str) -> None:
        # Never both: compose accepts the pair and the result is ambiguous to a reader.
        service = services[name]
        assert ("image" in service) != ("build" in service), f"{name} must declare exactly one of image/build"


class TestImagePinning:
    def test_no_composed_image_floats_on_latest(self, services: dict[str, Any]) -> None:
        # The API targets net10.0 and the SDK was absent from at least one environment
        # (LET-112). A floating tag turns that into a restore error reading like a code
        # problem, so every base image here is pinned to a major.
        for name, service in services.items():
            image = cast(str | None, service.get("image"))
            if image is None:
                continue
            tag = image.rpartition(":")[2]
            assert tag and tag != image, f"{name} pins no tag at all"
            assert tag != "latest", f"{name} floats on :latest"

    def test_no_text_asserted_file_pins_an_image_to_latest(self) -> None:
        for path in TEXT_ASSERTED_FILES:
            assert ":latest" not in _effective(path), f"{path.name} pins an image to :latest"

    def test_keycloak_is_pinned(self, services: dict[str, Any]) -> None:
        # Anchored to `id`. A whole-file search would still pass if this moved services.
        assert services["id"]["image"] == "quay.io/keycloak/keycloak:26.0"

    def test_dotnet_images_are_pinned_to_ten(self) -> None:
        content = _effective(API_DOCKERFILE)
        assert "mcr.microsoft.com/dotnet/sdk:10.0" in content
        assert "mcr.microsoft.com/dotnet/aspnet:10.0" in content


class TestPorts:
    # (service, host port, container port) -- each read from that service's own `ports`.
    # 4200 keeps e2e/playwright.config.ts's existing baseURL valid with no change; 8080 is
    # the authority backend/appsettings.json already configures; the API takes 5080
    # because 8080 on the host is already Keycloak's, and is published at all so the
    # `ng serve` inner loop and a developer with curl can reach it directly.
    PUBLISHED = [("web", "4200", "80"), ("id", "8080", "8080"), ("api", "5080", "8080")]

    @pytest.mark.parametrize(("name", "host", "container"), PUBLISHED)
    def test_service_publishes_its_expected_port(
        self, services: dict[str, Any], name: str, host: str, container: str
    ) -> None:
        assert _published_ports(services[name]).get(host) == container

    def test_no_two_services_claim_the_same_host_port(self, services: dict[str, Any]) -> None:
        # The reason the API is on 5080 in the first place.
        claimed = [host for service in services.values() for host in _published_ports(service)]
        assert len(claimed) == len(set(claimed)), f"host ports collide: {claimed}"


class TestRealmImport:
    def test_the_realm_is_imported_at_container_start(self, services: dict[str, Any]) -> None:
        # --import-realm reads every file in /opt/keycloak/data/import at start.
        command = services["id"]["command"]
        tokens = cast(list[str], command) if isinstance(command, list) else str(command).split()
        assert "--import-realm" in tokens

    def test_the_realm_export_is_mounted_where_the_import_looks(self, services: dict[str, Any]) -> None:
        # The import flag and the mount have to agree. Asserted as a pair because either
        # one alone is inert: a flag with nothing mounted imports an empty directory.
        targets = [target for _, target, _ in _mounts(services["id"])]
        assert REALM_IMPORT_TARGET in targets

    def test_the_realm_file_is_mounted_read_only(self, services: dict[str, Any]) -> None:
        # So a container cannot rewrite the committed export.
        mount = next(m for m in _mounts(services["id"]) if m[1] == REALM_IMPORT_TARGET)
        source, _, mode = mount
        assert mode == "ro"
        # And the source is the export this repository actually commits.
        assert (LOCAL_DIR / source).resolve() == REALM_EXPORT.resolve()

    def test_keycloak_keeps_no_state_across_a_teardown(self, compose: dict[str, Any]) -> None:
        # The realm has to be identical after a down/up. Keycloak's dev mode holds its
        # embedded store inside the container, so the guarantee is simply that nothing
        # persists it -- no named volume, and no mount of its data directory. The realm
        # import mount is fine: it is read-only and lives *under* the data directory, in
        # import/, which is why this checks the data directory itself rather than prefixes.
        assert "volumes" not in compose, "a top-level volume would outlive the stack"
        for name, service in cast(dict[str, dict[str, Any]], compose["services"]).items():
            for source, target, _ in _mounts(service):
                assert target != KEYCLOAK_DATA_DIR, f"{name} persists Keycloak's data directory"
                assert not target.startswith(f"{KEYCLOAK_DATA_DIR}/h2"), f"{name} persists Keycloak's store"
                assert source != "", f"{name} declares an anonymous volume at {target}"

    def test_keycloak_declares_only_the_realm_mount(self, services: dict[str, Any]) -> None:
        # Stated positively as well, so a second mount appearing has to be justified
        # rather than merely having to dodge the prohibitions above.
        assert [target for _, target, _ in _mounts(services["id"])] == [REALM_IMPORT_TARGET]


class TestApiConfiguration:
    def test_the_authority_is_overridden_for_the_container_network(self, services: dict[str, Any]) -> None:
        # appsettings.json configures http://localhost:8080, which inside the api
        # container is the API itself rather than Keycloak. Anchored to `api`: this
        # setting on any other service would be inert, and a text search could not tell.
        assert _environment(services["api"])["Identity__Authority"] == "http://id:8080"

    @pytest.mark.parametrize("setting", ["Identity__Realm", "Identity__ClientId"])
    def test_the_realm_and_client_are_not_duplicated_in_compose(
        self, services: dict[str, Any], setting: str
    ) -> None:
        # They are correct in appsettings.json. Repeating them here would let this file
        # silently override a deliberate change to it.
        for name, service in services.items():
            assert setting not in _environment(service), f"{name} duplicates {setting}"

    @pytest.mark.parametrize("setting", ["ASPNETCORE_HTTPS_PORTS", "ASPNETCORE_URLS"])
    def test_no_https_port_is_configured_in_compose(self, services: dict[str, Any], setting: str) -> None:
        # Program.cs calls UseHttpsRedirection() unconditionally. With no HTTPS port
        # discoverable it passes requests through; set one and every proxied request
        # starts answering 307.
        #
        # Absence of the key is what is asserted. `_environment` reports a key holding an
        # empty value as present, so `ASPNETCORE_HTTPS_PORTS:` with nothing after it fails
        # this rather than satisfying it -- which a "substring not found" check would not.
        for name, service in services.items():
            assert setting not in _environment(service), f"{name} sets {setting}"

    @pytest.mark.parametrize("setting", ["ASPNETCORE_HTTPS_PORTS", "ASPNETCORE_URLS"])
    def test_no_https_port_is_configured_in_the_api_dockerfile(self, setting: str) -> None:
        assert setting not in _effective(API_DOCKERFILE)


class TestBuildContexts:
    # (service, build context, dockerfile) -- the Dockerfiles live in this surface and
    # only the build contexts reach into the others, which is what keeps the provisioning
    # of all three services inside `infrastructure`.
    BUILDS = [
        ("api", "../../backend", "../infrastructure/local/api.Dockerfile"),
        ("web", "../../frontend", "../infrastructure/local/web.Dockerfile"),
    ]

    @pytest.mark.parametrize(("name", "context", "dockerfile"), BUILDS)
    def test_build_points_at_the_surface_being_built(
        self, services: dict[str, Any], name: str, context: str, dockerfile: str
    ) -> None:
        build = cast(dict[str, Any], services[name]["build"])
        assert build["context"] == context
        assert build["dockerfile"] == dockerfile

    @pytest.mark.parametrize(("name", "context", "dockerfile"), BUILDS)
    def test_the_build_context_and_dockerfile_resolve_to_real_paths(
        self, services: dict[str, Any], name: str, context: str, dockerfile: str
    ) -> None:
        # The two paths resolve against different roots, which is the part worth a test:
        # `context` is relative to this compose file, and `dockerfile` is relative to the
        # resolved *context*, not to the compose file. Getting that wrong produces a build
        # error at `docker compose up` rather than anything visible here.
        del name
        resolved_context = (LOCAL_DIR / context).resolve()
        assert resolved_context.is_dir()
        assert (resolved_context / dockerfile).resolve().is_file()


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


class TestNormalisation:
    """Direct tests of the two helpers the absence assertions above depend on.

    These guard the mechanism rather than the stack. `test_no_https_port_is_configured_*`
    is only as good as `_environment`'s definition of "present", and the whole reason
    LET-128 exists is that a previous absence check was satisfiable by something that was
    not really an absence. A helper that quietly dropped an empty-valued key would
    reintroduce exactly that bug with the tests still green.
    """

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ({"KEY": "value"}, {"KEY": "value"}),
            ({"KEY": 8080}, {"KEY": "8080"}),
            ({"KEY": ""}, {"KEY": ""}),
            ({"KEY": None}, {"KEY": None}),
            (["KEY=value"], {"KEY": "value"}),
            (["KEY="], {"KEY": ""}),
            (["KEY"], {"KEY": None}),
        ],
    )
    def test_environment_normalises_both_compose_forms(self, raw: Any, expected: dict[str, str | None]) -> None:
        assert _environment({"environment": raw}) == expected

    @pytest.mark.parametrize("raw", [{"KEY": ""}, {"KEY": None}, ["KEY="], ["KEY"]])
    def test_a_key_holding_nothing_still_counts_as_present(self, raw: Any) -> None:
        # The fringe case LET-128 names: absent and present-but-empty are different
        # states, and only the first may satisfy an absence assertion.
        assert "KEY" in _environment({"environment": raw})

    def test_a_service_with_no_environment_has_no_keys(self) -> None:
        assert _environment({}) == {}

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            (["4200:80"], {"4200": "80"}),
            (["127.0.0.1:4200:80"], {"4200": "80"}),
            (["4200:80/tcp"], {"4200": "80"}),
            ([{"published": 4200, "target": 80}], {"4200": "80"}),
            (["80"], {}),  # container port only -- the host port is assigned at random.
        ],
    )
    def test_published_ports_are_normalised_to_strings(self, raw: Any, expected: dict[str, str]) -> None:
        assert _published_ports({"ports": raw}) == expected
