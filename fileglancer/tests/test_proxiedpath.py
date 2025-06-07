import json
import pytest

from unittest.mock import patch

from . import (server_config_with_central_server, TEST_CENTRAL_SERVER)


TEST_USER = "test_user"
TEST_URL = f"{TEST_CENTRAL_SERVER}/proxied-path/{TEST_USER}"
TEST_INVALID_USER = "invalid_user"


@pytest.fixture
def jp_server_config(server_config_with_central_server):
    return server_config_with_central_server


@patch("fileglancer.handlers.ProxiedPathHandler.get_current_user", return_value=TEST_USER)
async def test_get_all_user_proxied_paths(test_current_user, jp_fetch, requests_mock):
    test_data = { "paths": [
        {
            "username": TEST_USER,
            "sharing_key": "test_key_1",
            "sharing_name": "test_name_1",
            "mount_path": "/test/path_1"
        },
        {
            "username": TEST_USER,
            "sharing_key": "test_key_2",
            "sharing_name": "test_name_2",
            "mount_path": "/test/path_2"
        }
    ]}
    requests_mock.get(TEST_URL, json=test_data)

    response = await jp_fetch("api", "fileglancer", "proxied-path")

    assert response.code == 200
    rj = json.loads(response.body)
    assert rj == test_data 


@patch("fileglancer.handlers.ProxiedPathHandler.get_current_user", return_value=TEST_USER)
async def test_get_specific_user_proxied_path(test_current_user, jp_fetch, requests_mock):
    test_key = "test_key"
    test_data = {
        "username": TEST_USER,
        "sharing_key": "test_key",
        "sharing_name": "test_name",
        "mount_path": "/test/path"
    }

    requests_mock.get(f"{TEST_URL}/{test_key}", json=test_data)

    response = await jp_fetch("api", "fileglancer", "proxied-path", params={"sharing_key": test_key})

    assert response.code == 200
    rj = json.loads(response.body)
    assert rj["sharing_key"] == test_data["sharing_key"]
    assert rj["sharing_name"] == test_data["sharing_name"]
    assert rj["mount_path"] == test_data["mount_path"]


@patch("fileglancer.handlers.ProxiedPathHandler.get_current_user", return_value=TEST_USER)
async def test_get_user_proxied_path_when_key_not_present(test_current_user, jp_fetch, requests_mock):
    test_key = "test_key_3"

    requests_mock.get(f"{TEST_URL}/{test_key}", status_code=404, json={"error": "Proxied path not found"})

    try:
        await jp_fetch("api", "fileglancer", "proxied-path", params={"sharing_key": test_key})
        assert False, "Expected 404 error"
    except Exception as e:
        assert e.code == 404
        rj = json.loads(e.response.body)
        assert rj["error"] == "Proxied path not found"


@patch("fileglancer.handlers.ProxiedPathHandler.get_current_user", return_value=TEST_INVALID_USER)
async def test_get_user_proxied_path_when_central_responds_with_404(test_current_user, jp_fetch, requests_mock):
    url_for_invalid_user = f"{TEST_CENTRAL_SERVER}/proxied-path/{TEST_INVALID_USER}"

    requests_mock.get(url_for_invalid_user, json={"error": "Returned an error"}, status_code=404)

    try:
        await jp_fetch("api", "fileglancer", "proxied-path")
        assert False, "Expected 404 error"
    except Exception as e:
        assert e.code == 404
        rj = json.loads(e.response.body)
        assert rj["error"] == "Proxied path not found"


@patch("fileglancer.handlers.ProxiedPathHandler.get_current_user", return_value=TEST_USER)
async def test_delete_user_proxied(test_current_user, jp_fetch, requests_mock):
    test_key = "test_key_2"
    test_delete_url = f"{TEST_URL}/{test_key}"
    requests_mock.delete(test_delete_url, status_code=204)
    response = await jp_fetch("api", "fileglancer", "proxied-path", method="DELETE", params={"username": TEST_USER, "sharing_key": test_key})
    assert response.code == 204


@patch("fileglancer.handlers.ProxiedPathHandler.get_current_user", return_value=TEST_USER)
async def test_delete_user_proxied_path_exception(test_current_user, jp_fetch, requests_mock):
    try:
        test_key = "test_key_2"
        test_delete_url = f"{TEST_URL}/{test_key}"
        requests_mock.delete(test_delete_url, status_code=404)
        await jp_fetch("api", "fileglancer", "proxied-path", method="DELETE", params={"username": TEST_USER, "sharing_key": test_key})
        assert False, "Expected 404 error"
    except Exception as e:
        assert e.code == 404
        rj = json.loads(e.response.body)
        assert rj["error"] == "Proxied path not found"


async def test_delete_user_proxied_path_without_key(jp_fetch):
    try:
        await jp_fetch("api", "fileglancer", "proxied-path", method="DELETE", params={"username": TEST_USER})
        assert False, "Expected 400 error"
    except Exception as e:
        assert e.code == 400
        rj = json.loads(e.response.body)
        assert rj["error"] == "Sharing key is required to delete a proxied path"


@patch("fileglancer.handlers.ProxiedPathHandler.get_current_user", return_value=TEST_USER)
async def test_post_user_proxied_path(test_current_user, jp_fetch, requests_mock):
    payload = {
        "fsp_name": "/test",
        "path": "path/to/data"
    }
    requests_mock.post(f"{TEST_URL}?fsp_name={payload['fsp_name']}&path={payload['path']}",
                       status_code=201,
                       json={
                           "username": TEST_USER,
                           "sharing_key": "test_key",
                           "sharing_name": "test_name",
                           "fsp_name": payload["fsp_name"],
                           "path": payload["path"]
                       })

    response = await jp_fetch("api", "fileglancer", "proxied-path",
                              method="POST",
                              body=json.dumps(payload),
                              headers={"Content-Type": "application/json"})
    rj = json.loads(response.body)
    assert response.code == 201
    assert rj["username"] == TEST_USER
    assert rj["sharing_key"] == "test_key"
    assert rj["sharing_name"] == "test_name"
    assert rj["fsp_name"] == payload["fsp_name"]
    assert rj["path"] == payload["path"]
    

@patch("fileglancer.handlers.ProxiedPathHandler.get_current_user", return_value=TEST_USER)
async def test_post_user_proxied_path_exception(test_current_user, jp_fetch, requests_mock):
    try:
        payload = {
            "fsp_name": "/test",
            "path": "path/to/data"
        }
        requests_mock.post(f"{TEST_URL}?fsp_name={payload['fsp_name']}&path={payload['path']}",
                        status_code=404,
                        json={
                            "error": "Some error"
                        })

        await jp_fetch("api", "fileglancer", "proxied-path",
                        method="POST",
                        body=json.dumps(payload),
                        headers={"Content-Type": "application/json"})
        assert False, "Expected 404 error"        
    except Exception as e:
        assert e.code == 404
        rj = json.loads(e.response.body)
        assert rj["error"] == "Proxied path not found"


async def test_post_user_proxied_path_without_mountpath(jp_fetch):
    try:
        await jp_fetch("api", "fileglancer", "proxied-path",
                       method="POST",
                       body=json.dumps({}), # empty payload
                       headers={"Content-Type": "application/json"})
        assert False, "Expected 400 error"
    except Exception as e:
        assert e.code == 400
        rj = json.loads(e.response.body)
        assert rj["error"] == "fsp_name and path are required to create a proxied path"


@patch("fileglancer.handlers.ProxiedPathHandler.get_current_user", return_value=TEST_USER)
async def test_patch_user_proxied_path(test_current_user, jp_fetch, requests_mock):
    test_key = "test_key"
    new_fsp_name = "test"
    new_path = "path/to/data"
    new_sharing_name = "newname"
    requests_mock.put(f"{TEST_URL}/{test_key}?fsp_name={new_fsp_name}&path={new_path}&sharing_name={new_sharing_name}",
                       status_code=200,
                       json={
                            "username": TEST_USER,
                            "sharing_key": test_key,
                            "sharing_name": new_sharing_name,
                            "fsp_name": new_fsp_name,
                            "path": new_path
                       })

    response = await jp_fetch("api", "fileglancer", "proxied-path",
                              method="PATCH",
                              body=json.dumps({
                                  "fsp_name": new_fsp_name,
                                  "path": new_path,
                                  "sharing_key": test_key,
                                  "sharing_name": new_sharing_name
                              }),
                              headers={"Content-Type": "application/json"})
    rj = json.loads(response.body)
    assert response.code == 200
    assert rj["username"] == TEST_USER
    assert rj["sharing_key"] == test_key
    assert rj["sharing_name"] == new_sharing_name
    assert rj["fsp_name"] == new_fsp_name
    assert rj["path"] == new_path


@patch("fileglancer.handlers.ProxiedPathHandler.get_current_user", return_value=TEST_USER)
async def test_patch_user_proxied_path_exception(test_current_user, jp_fetch, requests_mock):
    try:
        test_key = "test_key"
        new_fsp_name = "test"
        new_path = "path/to/data"
        new_sharing_name = "newname"
        requests_mock.put(f"{TEST_URL}/{test_key}?fsp_name={new_fsp_name}&path={new_path}&sharing_name={new_sharing_name}",
                          status_code=404,
                          json={
                            "error": "Some error"
                          })

        await jp_fetch("api", "fileglancer", "proxied-path",
                        method="PATCH",
                        body=json.dumps({
                            "fsp_name": new_fsp_name,
                            "path": new_path,
                            "sharing_key": test_key,
                            "sharing_name": new_sharing_name
                        }),
                        headers={"Content-Type": "application/json"})
        assert False, "Expected 404 error"        
    except Exception as e:
        assert e.code == 404
        rj = json.loads(e.response.body)
        assert rj["error"] == "Proxied path not found"


async def test_patch_user_proxied_path_without_sharingkey(jp_fetch):
    try:
        await jp_fetch("api", "fileglancer", "proxied-path",
                       method="PATCH",
                       body=json.dumps({}), # empty payload
                       headers={"Content-Type": "application/json"})
        assert False, "Expected 400 error"
    except Exception as e:
        assert e.code == 400
        rj = json.loads(e.response.body)
        assert rj["error"] == "sharing_key is required to update a proxied path"
