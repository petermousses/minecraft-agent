import argparse
import concurrent.futures
import hashlib
import json
import os
import pathlib
import platform
import re
import urllib.request
import zipfile


ROOT = pathlib.Path(__file__).resolve().parent
VERSION = json.loads((ROOT.parent / "research/version-1.16.5.json").read_text())
LWJGL_VERSION = "3.3.1"


def resolve_platform(value):
    if value != "auto":
        return value
    system = platform.system().lower()
    arch = platform.machine().lower()
    if system == "darwin":
        return "macos-arm64" if arch in ("arm64", "aarch64") else "macos-x64"
    if system == "linux":
        return "linux-arm64" if arch in ("arm64", "aarch64") else "linux-x64"
    raise RuntimeError(f"Unsupported native-client platform: {system}/{arch}")


def platform_parts(target):
    if target.startswith("linux-"):
        return "linux", "natives-linux-arm64" if target.endswith("arm64") else "natives-linux"
    if target.startswith("macos-"):
        return "osx", "natives-macos-arm64" if target.endswith("arm64") else "natives-macos"
    raise RuntimeError(f"Unsupported native-client platform: {target}")


def rule_matches(rule, os_name):
    rule_os = rule.get("os", {})
    if rule_os.get("name", os_name) != os_name:
        return False
    arch = rule_os.get("arch")
    if arch and not re.search(arch, platform.machine()):
        return False
    os_version = rule_os.get("version")
    if os_version and not re.search(os_version, platform.version()):
        return False
    return True


def library_allowed(lib, os_name):
    rules = lib.get("rules", [])
    allowed = not rules
    for rule in rules:
        if rule_matches(rule, os_name):
            allowed = rule["action"] == "allow"
    return allowed


def get(url, path, sha1=None):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and (not sha1 or hashlib.sha1(path.read_bytes()).hexdigest() == sha1):
        return path
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                data = response.read()
            if sha1 and hashlib.sha1(data).hexdigest() != sha1:
                raise ValueError(f"SHA-1 mismatch for {url}")
            path.write_bytes(data)
            return path
        except Exception as error:
            if attempt == 2:
                raise RuntimeError(f"failed to download {url}: {error}") from error


def main():
    parser = argparse.ArgumentParser(description="Install Minecraft 1.16.5 native display dependencies")
    parser.add_argument("--platform", default="auto", choices=("auto", "linux-arm64", "linux-x64", "macos-arm64", "macos-x64"))
    target = resolve_platform(parser.parse_args().platform)
    os_name, lwjgl_natives = platform_parts(target)

    cache = ROOT / "libraries"
    natives = ROOT / "natives"
    cache.mkdir(exist_ok=True)
    natives.mkdir(exist_ok=True)
    classpath = []
    jobs = []
    lwjgl_seen = set()

    for lib in VERSION["libraries"]:
        if not library_allowed(lib, os_name):
            continue
        group, artifact, version = lib["name"].split(":")[:3]
        if group == "org.lwjgl":
            if artifact in lwjgl_seen:
                continue
            lwjgl_seen.add(artifact)
            base = f"https://repo.maven.apache.org/maven2/org/lwjgl/{artifact}/{LWJGL_VERSION}/{artifact}-{LWJGL_VERSION}"
            jar = cache / f"{artifact}-{LWJGL_VERSION}.jar"
            native_jar = cache / f"{artifact}-{LWJGL_VERSION}-{lwjgl_natives}.jar"
            classpath.append(str(jar))
            jobs.extend(((base + ".jar", jar, None), (base + f"-{lwjgl_natives}.jar", native_jar, None)))
            continue
        artifact_info = lib.get("downloads", {}).get("artifact")
        if artifact_info:
            path = cache / artifact_info["path"]
            classpath.append(str(path))
            jobs.append((artifact_info["url"], path, artifact_info.get("sha1")))

    client = VERSION["downloads"]["client"]
    client_path = ROOT / "client.jar"
    classpath.append(str(client_path))
    jobs.append((client["url"], client_path, client["sha1"]))

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(lambda args: get(*args), jobs))

    for native_jar in cache.glob(f"*{lwjgl_natives}.jar"):
        with zipfile.ZipFile(native_jar) as archive:
            for name in archive.namelist():
                if name.endswith((".so", ".dylib", ".dll")):
                    (natives / pathlib.Path(name).name).write_bytes(archive.read(name))

    asset_index = VERSION["assetIndex"]
    index_path = get(asset_index["url"], ROOT / "assets/indexes" / f"{asset_index['id']}.json", asset_index["sha1"])
    assets = json.loads(index_path.read_text())["objects"]
    home_assets = pathlib.Path.home() / "Library/Application Support/minecraft/assets/objects"
    jobs = []
    for asset in assets.values():
        digest = asset["hash"]
        path = ROOT / "assets/objects" / digest[:2] / digest
        cached = home_assets / digest[:2] / digest
        if os_name == "osx" and cached.exists() and not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            os.link(cached, path)
        else:
            jobs.append((f"https://resources.download.minecraft.net/{digest[:2]}/{digest}", path, digest))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda args: get(*args), jobs))

    (ROOT / "classpath.txt").write_text(os.pathsep.join(classpath))
    (ROOT / "config.json").write_text(json.dumps({"mainClass": VERSION["mainClass"], "assetIndex": asset_index["id"]}))
    print(f"Native client dependencies ready for {target}: {len(assets)} assets")


if __name__ == "__main__":
    main()
