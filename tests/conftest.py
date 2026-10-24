"""Shared fixtures."""
import os
import random
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def server(tmp_path_factory):
    if shutil.which("node") is None:
        pytest.skip("node is needed to run the server")
    data = tmp_path_factory.mktemp("srv")
    port = random.randint(20000, 40000)
    env = {**os.environ, "PORT": str(port), "DATA_DIR": str(data), "RADAR_STORE": "files"}
    proc = subprocess.Popen(["node", str(REPO / "infra" / "app" / "server.js")], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    for _ in range(60):
        try:
            urllib.request.urlopen(url + "/healthz", timeout=1)
            break
        except OSError:
            time.sleep(0.1)
    else:
        proc.kill()
        pytest.fail("server did not start")
    yield url
    proc.kill()


