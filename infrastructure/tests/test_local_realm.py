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

What this cannot cover: whether Keycloak actually accepts the export. That needs a
running container. See the PR and LET-119's completion report.
"""

import json
from pathlib import Path
from typing import Any, cast

import pytest

REALM_FILE = Path(__file__).resolve().parents[1] / "local" / "keycloak" / "team-targe-realm.json"

# appsettings.json, Identity section.
EXPECTED_REALM = "team-targe"
EXPECTED_CLIENT_ID = "team-targe-store"

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
def users_by_username(realm: dict[str, Any]) -> dict[str, dict[str, Any]]:
    users = cast(list[dict[str, Any]], realm["users"])
    return {cast(str, user["username"]): user for user in users}


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
