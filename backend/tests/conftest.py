import os
import tempfile

# Allow legacy X-User-ID fixture compatibility during pytest suite execution;
# dedicated security tests explicitly override this to "false" to assert production rejection.
os.environ.setdefault("CAIRN_ALLOW_LEGACY_HEADER_AUTH", "true")

_tmp = tempfile.mkdtemp()
os.environ["CAIRN_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["CAIRN_SECRET"] = "test-secret-test-secret-test-secret!!"
os.environ["CAIRN_FRONTEND_DIST"] = os.path.join(_tmp, "no-dist")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def client():
    import seed
    from app.main import app

    seed.seed(reset=True)
    with TestClient(app) as c:
        yield c


class Session:
    """Convenience wrapper: a signed-in API caller."""

    def __init__(self, client, email):
        r = client.post("/api/auth/login", json={"email": email, "password": "cairn-demo"})
        assert r.status_code == 200, r.text
        self.c = client
        self.h = {"Authorization": f"Bearer {r.json()['token']}"}

    def get(self, url, **kw):
        return self.c.get(url, headers=self.h, **kw)

    def post(self, url, **kw):
        return self.c.post(url, headers=self.h, **kw)

    def patch(self, url, **kw):
        return self.c.patch(url, headers=self.h, **kw)


@pytest.fixture()
def manager(client):
    return Session(client, "manager@cairn.demo")


@pytest.fixture()
def admin(client):
    return Session(client, "admin@cairn.demo")


@pytest.fixture()
def departing(client):
    return Session(client, "departing@cairn.demo")


@pytest.fixture()
def incoming(client):
    return Session(client, "incoming@cairn.demo")
