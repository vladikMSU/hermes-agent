"""Exact task/board reads through real host auth; synthetic isolated data only."""
import pytest

from hermes_cli import kanban_db as kb, web_server
from tests.hermes_cli.test_dashboard_auth_middleware import (
    gated_app, _complete_stub_login,
)
from tests.plugins.test_kanban_dashboard_plugin import kanban_home, _load_plugin_router


@pytest.fixture
def mounted(gated_app, kanban_home):
    routes = list(web_server.app.router.routes)
    web_server.app.include_router(_load_plugin_router(), prefix="/api/plugins/kanban")
    try:
        yield gated_app
    finally:
        web_server.app.router.routes[:] = routes


def test_task_link_cannot_bypass_auth_or_switch_board_identity(mounted):
    url = "/api/plugins/kanban/tasks/t_unknown?board=alpha"
    assert mounted.get(url).status_code == 401
    assert mounted.get(url, headers={"Authorization": "Bearer invalid"}).status_code == 401
    _complete_stub_login(mounted)
    kb.create_board("alpha")
    kb.create_board("beta")
    created = mounted.post("/api/plugins/kanban/tasks?board=alpha", json={"title": "same title"})
    assert created.status_code == 200, created.text
    task = created.json()["task"]
    other = mounted.post("/api/plugins/kanban/tasks?board=beta", json={"title": "same title"})
    assert other.status_code == 200
    exact = f"/api/plugins/kanban/tasks/{task['id']}"
    response = mounted.get(exact + "?board=alpha")
    assert response.status_code == 200
    assert response.json()["task"]["id"] == task["id"]
    for suffix in ("?board=beta", "?board=missing"):
        assert mounted.get(exact + suffix).status_code == 404
    assert mounted.get(url).status_code == 404
    mounted.cookies.clear()
    assert mounted.get(exact + "?board=alpha").status_code == 401
