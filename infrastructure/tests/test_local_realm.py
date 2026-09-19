"""Validation of the committed Keycloak realm export for the local stack.

This is not a construct-synth test -- there is no construct here. It is pytest, this
surface's one declared test level (infrastructure/CONVENTIONS.md, Test levels), applied
to the other kind of thing this surface now owns: a data file whose correctness is
invisible until a sign-in fails.

Every value asserted below is dictated by merged backend code, not chosen here:
`KeycloakOptions` and `appsettings.json` fix the realm, client, and claim names;
`EmployeeRole` fixes the closed set of roles; `KeycloakEmployeeIdentityResolver` fixes
the grant type and the fact that identity is read from /userinfo. A test that drifts
from those is reporting a real problem, not a stale expectation.

One block of values is the exception, and is named as one: LET-129's `team-targe-admin`
client and its service account. Nothing consumes them yet -- LET-130 writes the call that
does -- so what fixes their shape is Keycloak's own client-credentials grant and Admin
API, plus the key names `docker-compose.yml` passes the API. A drift between the secret
there and the secret here is a real failure, and tests/test_local_stack.py asserts the
two match.

What this cannot cover: whether Keycloak actually accepts the export. That needs a
running container. See the PR and LET-119's completion report -- and, for the admin
client's token and Admin API call specifically, LET-129's.
"""

import json
from pathlib import Path
from typing import Any, cast

import pytest

REALM_FILE = Path(__file__).resolve().parents[1] / "local" / "keycloak" / "team-targe-realm.json"

# appsettings.json, Identity section.
EXPECTED_REALM = "team-targe"
EXPECTED_CLIENT_ID = "team-targe-store"

# LET-129's confidential client, and the service account Keycloak creates for it. The API
# authenticates as this client to terminate an employee's other sessions at sign-in
# (LET-130 writes that call). `docker-compose.yml` passes the pair to the API as
# Identity__Admin__ClientId / Identity__Admin__ClientSecret; tests/test_local_stack.py
# asserts that end, including that the secret there and the secret here are the same string.
ADMIN_CLIENT_ID = "team-targe-admin"
ADMIN_SERVICE_ACCOUNT_USERNAME = "service-account-team-targe-admin"

# Keycloak's own built-in client, created for every realm, whose roles gate the Admin API.
# It is not in this export and must not be: Keycloak provides it, and declaring it here
# would fight the realm's own bootstrap.
REALM_MANAGEMENT_CLIENT = "realm-management"

# The single role the service account is granted. `manage-users` is what Keycloak requires
# for POST /admin/realms/{realm}/users/{id}/logout -- the call that ends every session a
# user holds. Not `realm-admin`, which carries every other administrative power with it.
SESSION_TERMINATION_ROLE = "manage-users"

# KeycloakOptions' RoleClaim / DepartmentClaim / JobFunctionClaim defaults. Each is a
# realm user-attribute mapper rather than a standard OIDC claim, and each is hard-required
# by the resolver: a missing or empty value is a 502, not a sign-in.
CUSTOM_CLAIMS = ("store_role", "department", "job_function")

# Tarjay.Team.Domain/Identity/EmployeeRole -- a closed set of four.
EMPLOYEE_ROLES = frozenset({"Associate", "DepartmentManager", "StoreManager", "ReceivingAssociate"})

# The seeded employees from LET-119, one per role plus the Customer Support case. Chosen
# so every branch of the frontend's roleSpecificNavItem is reachable with a real credential.
SEEDED_EMPLOYEES: dict[str, dict[str, str]] = {
    "10041": {
        "pin": "4417",
        "firstName": "Dana",
        "lastName": "Okafor",
        "store_role": "Associate",
        "department": "Grocery",
        "job_function": "Stocking",
    },
    "10042": {
        "pin": "5528",
        "firstName": "Sam",
        "lastName": "Rivera",
        "store_role": "DepartmentManager",
        "department": "Grocery",
        "job_function": "Stocking",
    },
    "10043": {
        "pin": "6639",
        "firstName": "Alex",
        "lastName": "Mercer",
        "store_role": "StoreManager",
        "department": "Store Operations",
        "job_function": "Store Management",
    },
    "10044": {
        "pin": "7741",
        "firstName": "Priya",
        "lastName": "Raman",
        "store_role": "ReceivingAssociate",
        "department": "Receiving",
        "job_function": "Receiving",
    },
    "10045": {
        "pin": "8852",
        "firstName": "Chris",
        "lastName": "Bell",
        "store_role": "Associate",
        "department": "Grocery",
        "job_function": "Customer Support",
    },
}


@pytest.fixture(scope="module")
def realm() -> dict[str, Any]:
    with REALM_FILE.open(encoding="utf-8") as handle:
        return cast(dict[str, Any], json.load(handle))


@pytest.fixture(scope="module")
def client(realm: dict[str, Any]) -> dict[str, Any]:
    clients = cast(list[dict[str, Any]], realm["clients"])
    matching = [entry for entry in clients if entry["clientId"] == EXPECTED_CLIENT_ID]
    assert len(matching) == 1, f"expected exactly one {EXPECTED_CLIENT_ID} client"
    return matching[0]


@pytest.fixture(scope="module")
def admin_client(realm: dict[str, Any]) -> dict[str, Any]:
    clients = cast(list[dict[str, Any]], realm["clients"])
    matching = [entry for entry in clients if entry["clientId"] == ADMIN_CLIENT_ID]
    assert len(matching) == 1, f"expected exactly one {ADMIN_CLIENT_ID} client"
    return matching[0]


@pytest.fixture(scope="module")
def service_accounts(realm: dict[str, Any]) -> list[dict[str, Any]]:
    """Every service-account user in the export.

    Keycloak represents a confidential client's service account as a user carrying
    `serviceAccountClientId`, which is also the only place a realm export can grant it a
    role. So the client and its permission live in two different sections of this file,
    and neither half is any use alone.
    """
    users = cast(list[dict[str, Any]], realm["users"])
    return [user for user in users if "serviceAccountClientId" in user]


@pytest.fixture(scope="module")
def users_by_username(realm: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """The realm's *employees*, keyed by username -- service accounts excluded.

    The exclusion arrived with LET-129, which added the first service account to this
    realm, and it is a narrowing of what this fixture covers rather than of what any
    assertion below proves. Every test in TestSeededEmployees is about an employee: a
    PIN, three custom claims, a role from the closed set. A service account has none of
    those, so including it would not test it -- it would raise KeyError in tests that are
    not about it. `test_exactly_the_five_seeded_employees_are_present` still pins the
    employee set at exactly five, and the service account is asserted exactly, and
    separately, in TestAdminServiceAccount.
    """
    users = cast(list[dict[str, Any]], realm["users"])
    return {cast(str, user["username"]): user for user in users if "serviceAccountClientId" not in user}


@pytest.fixture(scope="module")
def user_profile(realm: dict[str, Any]) -> dict[str, Any]:
    """The declarative user profile, which Keycloak nests as a JSON string."""
    components = cast(dict[str, Any], realm["components"])
    providers = cast(list[dict[str, Any]], components["org.keycloak.userprofile.UserProfileProvider"])
    raw = cast(list[str], providers[0]["config"]["kc.user.profile.config"])[0]
    return cast(dict[str, Any], json.loads(raw))


class TestRealm:
    def test_realm_is_the_name_appsettings_configures(self, realm: dict[str, Any]) -> None:
        # Not a truncation of "team-target". Confirmed by the architect on 2026-09-16.
        assert realm["realm"] == EXPECTED_REALM
        assert realm["enabled"] is True

    def test_plain_http_is_allowed(self, realm: dict[str, Any]) -> None:
        # The default ("external") would reject the API reaching http://id:8080.
        assert realm["sslRequired"] == "none"

    def test_a_four_digit_pin_is_an_acceptable_password(self, realm: dict[str, Any]) -> None:
        # PINs are passwords. Keycloak's default is no policy at all; if one is ever
        # added here it must not impose a minimum longer than four characters.
        policy = cast(str, realm.get("passwordPolicy", ""))
        assert "length" not in policy, f"password policy {policy!r} may reject a four-digit PIN"
        assert "digits" not in policy
        assert "upperCase" not in policy
        assert "specialChars" not in policy

    def test_brute_force_protection_is_off(self, realm: dict[str, Any]) -> None:
        # A suite asserting the wrong-PIN rejection runs it every pass. With protection
        # on, the seeded employee is temporarily disabled and the next run's *valid*
        # sign-in fails for a reason nothing in the test explains.
        assert realm["bruteForceProtected"] is False

    def test_employees_cannot_self_register_or_sign_in_by_email(self, realm: dict[str, Any]) -> None:
        # Employees are seeded and have no email address; Employee ID + PIN is the only path.
        assert realm["registrationAllowed"] is False
        assert realm["loginWithEmailAllowed"] is False
        assert realm["resetPasswordAllowed"] is False

    def test_verify_profile_is_disabled(self, realm: dict[str, Any]) -> None:
        # Employees have no email, so a profile-completeness check would attach a
        # required action and make the password grant fail instead of returning a token.
        actions = cast(list[dict[str, Any]], realm["requiredActions"])
        verify_profile = [action for action in actions if action["alias"] == "VERIFY_PROFILE"]
        assert verify_profile, "VERIFY_PROFILE should be listed explicitly, not left to the default"
        assert verify_profile[0]["enabled"] is False

    def test_no_required_action_is_a_default_action(self, realm: dict[str, Any]) -> None:
        # Any default action interrupts grant_type=password for every seeded employee.
        actions = cast(list[dict[str, Any]], realm["requiredActions"])
        defaulted = [action["alias"] for action in actions if action.get("defaultAction")]
        assert defaulted == [], f"default required actions would break the password grant: {defaulted}"


class TestClient:
    def test_client_is_public(self, client: dict[str, Any]) -> None:
        # KeycloakOptions.ClientSecret ships empty and the resolver omits client_secret
        # when it is, so a confidential client would reject every token request.
        assert client["publicClient"] is True
        assert "secret" not in client

    def test_direct_access_grants_are_enabled(self, client: dict[str, Any]) -> None:
        # The resolver uses grant_type=password. Off by default on a new client, and the
        # single setting most likely to be missed when a realm is configured by hand.
        assert client["directAccessGrantsEnabled"] is True

    def test_client_is_enabled_for_openid_connect(self, client: dict[str, Any]) -> None:
        assert client["enabled"] is True
        assert client["protocol"] == "openid-connect"

    @pytest.mark.parametrize("claim", CUSTOM_CLAIMS)
    def test_each_custom_claim_has_a_user_attribute_mapper(self, client: dict[str, Any], claim: str) -> None:
        mappers = cast(list[dict[str, Any]], client["protocolMappers"])
        matching = [m for m in mappers if m["config"].get("claim.name") == claim]
        assert len(matching) == 1, f"expected exactly one mapper producing the {claim} claim"
        assert matching[0]["protocolMapper"] == "oidc-usermodel-attribute-mapper"
        assert matching[0]["config"]["user.attribute"] == claim

    @pytest.mark.parametrize("claim", CUSTOM_CLAIMS)
    def test_each_custom_claim_reaches_userinfo(self, client: dict[str, Any], claim: str) -> None:
        # The one that costs a day when missed. The resolver reads identity from
        # /userinfo, and an attribute mapper does not reach userinfo by default: the
        # credential check succeeds and every sign-in then fails as identity-incomplete,
        # which looks like a code bug and is not one.
        mappers = cast(list[dict[str, Any]], client["protocolMappers"])
        mapper = next(m for m in mappers if m["config"].get("claim.name") == claim)
        assert mapper["config"]["userinfo.token.claim"] == "true"

    def test_default_client_scopes_are_left_to_the_realm(self, client: dict[str, Any]) -> None:
        # preferred_username and `name` come from the built-in `profile` scope, which
        # Keycloak attaches by default. Naming scopes explicitly only adds a way for the
        # import to fail on one that does not exist in this Keycloak version.
        assert "defaultClientScopes" not in client


class TestAdminClient:
    """The confidential client backing the admin session-termination call (LET-129).

    Everything here is structure: that the client exists, is confidential, has a service
    account, and can do nothing a service account should not. What no assertion in this
    file can reach is whether Keycloak issues that service account a token carrying
    `manage-users`, or whether the token then works against the logout-sessions endpoint.
    Both need the container running -- see the PR and LET-129's completion report for the
    commands, and for the fact that they were not run.
    """

    def test_the_client_exists_and_is_enabled(self, admin_client: dict[str, Any]) -> None:
        assert admin_client["enabled"] is True
        assert admin_client["protocol"] == "openid-connect"

    def test_the_client_is_confidential_with_a_secret(self, admin_client: dict[str, Any]) -> None:
        # A public client cannot hold a service account: the client-credentials grant
        # authenticates the client itself, and a public one has no credential to present.
        assert admin_client["publicClient"] is False
        assert cast(str, admin_client["secret"]).strip() != ""

    def test_the_client_has_a_service_account(self, admin_client: dict[str, Any]) -> None:
        # Off by default on a new client, and the setting the whole story rests on: with
        # it off, Keycloak refuses the client-credentials grant and creates no account to
        # carry the role.
        assert admin_client["serviceAccountsEnabled"] is True

    @pytest.mark.parametrize("flow", ["standardFlowEnabled", "directAccessGrantsEnabled", "implicitFlowEnabled"])
    def test_no_interactive_flow_is_enabled(self, admin_client: dict[str, Any], flow: str) -> None:
        # Nothing signs in *as a person* through this client. Direct access grants in
        # particular would turn a leaked secret into a way to exchange any employee's PIN.
        assert admin_client[flow] is False

    @pytest.mark.parametrize("field", ["redirectUris", "webOrigins"])
    def test_the_client_offers_no_browser_surface(self, admin_client: dict[str, Any], field: str) -> None:
        # There is no browser leg at all, so an entry here could only ever be a mistake.
        assert cast(list[str], admin_client[field]) == []

    def test_it_is_the_only_client_with_a_service_account(self, realm: dict[str, Any]) -> None:
        # Stated over the whole realm rather than about this client alone: the point of
        # LET-129 is that exactly one identity can reach the Admin API, and a second
        # service account appearing anywhere would quietly undo that.
        clients = cast(list[dict[str, Any]], realm["clients"])
        with_accounts = [c["clientId"] for c in clients if c.get("serviceAccountsEnabled")]
        assert with_accounts == [ADMIN_CLIENT_ID]

    def test_the_employee_facing_client_stays_public_and_secretless(self, client: dict[str, Any]) -> None:
        # The two clients are deliberately different shapes, and the risk when adding the
        # second is bleeding its settings into the first. `KeycloakOptions.ClientSecret`
        # ships empty and the resolver omits `client_secret` when it is, so a secret
        # appearing on the store client would reject every employee sign-in.
        assert client["publicClient"] is True
        assert "secret" not in client
        assert client["serviceAccountsEnabled"] is False

    def test_keycloaks_own_realm_management_client_is_not_redeclared(self, realm: dict[str, Any]) -> None:
        # `realm-management` is created by Keycloak for every realm and holds the
        # `manage-users` role granted below. Declaring it in an export means defining its
        # roles by hand, which is how a grant ends up pointing at a role that no longer
        # means what it did.
        declared = {cast(str, c["clientId"]) for c in cast(list[dict[str, Any]], realm["clients"])}
        assert REALM_MANAGEMENT_CLIENT not in declared


class TestAdminServiceAccount:
    def test_exactly_one_service_account_exists_and_it_is_the_admin_clients(
        self, service_accounts: list[dict[str, Any]]
    ) -> None:
        assert len(service_accounts) == 1
        account = service_accounts[0]
        assert account["serviceAccountClientId"] == ADMIN_CLIENT_ID
        # Keycloak derives this name from the client id and links the two by it. A
        # mismatch imports as an ordinary user that happens to hold an admin role.
        assert account["username"] == ADMIN_SERVICE_ACCOUNT_USERNAME

    def test_the_service_account_is_enabled_with_no_required_actions(
        self, service_accounts: list[dict[str, Any]]
    ) -> None:
        # A required action here would not prompt anyone -- there is no human at this
        # account -- it would just fail the client-credentials grant.
        account = service_accounts[0]
        assert account["enabled"] is True
        assert account["requiredActions"] == []

    def test_it_holds_manage_users_on_realm_management(self, service_accounts: list[dict[str, Any]]) -> None:
        client_roles = cast(dict[str, list[str]], service_accounts[0]["clientRoles"])
        assert client_roles[REALM_MANAGEMENT_CLIENT] == [SESSION_TERMINATION_ROLE]

    def test_it_holds_nothing_beyond_manage_users(self, service_accounts: list[dict[str, Any]]) -> None:
        # The fringe case LET-129 names: scoped to `manage-users` only, not broader admin
        # rights. Asserted as an equality over every grant rather than as the presence of
        # the one, because `realm-admin` sitting alongside it would satisfy presence.
        #
        # This is also what bounds the client's `fullScopeAllowed: true`, which is what
        # puts the role into the issued token: full scope is only as wide as the roles the
        # account actually holds, so the grant below is the real boundary.
        account = service_accounts[0]
        assert cast(dict[str, Any], account["clientRoles"]) == {REALM_MANAGEMENT_CLIENT: [SESSION_TERMINATION_ROLE]}
        assert "realmRoles" not in account, "a realm role on this account is a power nothing asked for"

    def test_the_service_account_has_no_password(self, service_accounts: list[dict[str, Any]]) -> None:
        # It authenticates with the client secret, through the client-credentials grant.
        # A password would additionally make it signable-into as a user.
        assert "credentials" not in service_accounts[0]

    def test_no_employee_holds_an_administrative_role(self, users_by_username: dict[str, dict[str, Any]]) -> None:
        # The other half of the containment: the seeded employees are the accounts a
        # person can actually sign into, with a four-digit PIN and no brute-force
        # protection. None of them may carry a role that reaches the Admin API.
        for username, user in users_by_username.items():
            assert "clientRoles" not in user, f"employee {username} holds client roles"
            assert "realmRoles" not in user, f"employee {username} holds realm roles"


class TestUserProfile:
    @pytest.mark.parametrize("claim", CUSTOM_CLAIMS)
    def test_each_custom_claim_is_a_declared_attribute(self, user_profile: dict[str, Any], claim: str) -> None:
        # Keycloak 24+ rejects unmanaged user attributes by default: an export that sets
        # them without declaring them has them silently dropped on import.
        declared = {cast(str, a["name"]) for a in cast(list[dict[str, Any]], user_profile["attributes"])}
        assert claim in declared

    def test_unmanaged_attributes_are_enabled(self, user_profile: dict[str, Any]) -> None:
        # Belt and braces alongside the declarations above, for anything seeded later.
        assert user_profile["unmanagedAttributePolicy"] == "ENABLED"

    @pytest.mark.parametrize("attribute", ["email", "firstName", "lastName"])
    def test_contact_attributes_are_optional(self, user_profile: dict[str, Any], attribute: str) -> None:
        # Keycloak's built-in default profile requires these for role `user`. Employees
        # here have no email, and an incomplete profile blocks the password grant.
        declared = {cast(str, a["name"]): a for a in cast(list[dict[str, Any]], user_profile["attributes"])}
        assert attribute in declared, f"{attribute} must be declared in order to be made optional"
        assert "required" not in declared[attribute]

    def test_store_role_is_constrained_to_the_closed_set(self, user_profile: dict[str, Any]) -> None:
        # So a typo in a seeded value fails the import loudly, rather than producing an
        # employee the API refuses to sign in.
        declared = {cast(str, a["name"]): a for a in cast(list[dict[str, Any]], user_profile["attributes"])}
        options = cast(list[str], declared["store_role"]["validations"]["options"]["options"])
        assert frozenset(options) == EMPLOYEE_ROLES


class TestSeededEmployees:
    def test_exactly_the_five_seeded_employees_are_present(self, users_by_username: dict[str, dict[str, Any]]) -> None:
        assert set(users_by_username) == set(SEEDED_EMPLOYEES)

    def test_every_role_in_the_closed_set_is_reachable(self, users_by_username: dict[str, dict[str, Any]]) -> None:
        # The point of the seed: each of the four roles signs in with a real credential,
        # so every branch of the frontend's role-based navigation is exercisable.
        seeded_roles = {cast(str, u["attributes"]["store_role"][0]) for u in users_by_username.values()}
        assert seeded_roles == EMPLOYEE_ROLES

    @pytest.mark.parametrize("username", sorted(SEEDED_EMPLOYEES))
    def test_employee_is_enabled_with_no_required_actions(
        self, users_by_username: dict[str, dict[str, Any]], username: str
    ) -> None:
        user = users_by_username[username]
        assert user["enabled"] is True
        assert user["requiredActions"] == []

    @pytest.mark.parametrize("username", sorted(SEEDED_EMPLOYEES))
    def test_employee_display_name(self, users_by_username: dict[str, dict[str, Any]], username: str) -> None:
        # The `name` claim the header shows is assembled from these by the built-in
        # full-name mapper in the `profile` scope.
        expected = SEEDED_EMPLOYEES[username]
        user = users_by_username[username]
        assert user["firstName"] == expected["firstName"]
        assert user["lastName"] == expected["lastName"]

    @pytest.mark.parametrize("username", sorted(SEEDED_EMPLOYEES))
    @pytest.mark.parametrize("claim", CUSTOM_CLAIMS)
    def test_employee_custom_claim_value(
        self, users_by_username: dict[str, dict[str, Any]], username: str, claim: str
    ) -> None:
        attributes = cast(dict[str, list[str]], users_by_username[username]["attributes"])
        assert attributes[claim] == [SEEDED_EMPLOYEES[username][claim]]

    @pytest.mark.parametrize("username", sorted(SEEDED_EMPLOYEES))
    @pytest.mark.parametrize("claim", CUSTOM_CLAIMS)
    def test_employee_custom_claim_is_non_empty(
        self, users_by_username: dict[str, dict[str, Any]], username: str, claim: str
    ) -> None:
        # The resolver treats a missing or blank value as identity-incomplete and answers
        # 502, so whitespace here is as broken as an absent attribute.
        values = cast(dict[str, list[str]], users_by_username[username]["attributes"])[claim]
        assert len(values) == 1
        assert values[0].strip() != ""

    @pytest.mark.parametrize("username", sorted(SEEDED_EMPLOYEES))
    def test_employee_pin_is_a_permanent_password(
        self, users_by_username: dict[str, dict[str, Any]], username: str
    ) -> None:
        # Temporary would attach an UPDATE_PASSWORD action and break the password grant.
        credentials = cast(list[dict[str, Any]], users_by_username[username]["credentials"])
        assert len(credentials) == 1
        assert credentials[0]["type"] == "password"
        assert credentials[0]["value"] == SEEDED_EMPLOYEES[username]["pin"]
        assert credentials[0]["temporary"] is False

    def test_every_pin_is_distinct(self, users_by_username: dict[str, dict[str, Any]]) -> None:
        # Otherwise a test asserting one employee's sign-in could pass on another's PIN.
        pins = [cast(list[dict[str, Any]], u["credentials"])[0]["value"] for u in users_by_username.values()]
        assert len(set(pins)) == len(pins)
