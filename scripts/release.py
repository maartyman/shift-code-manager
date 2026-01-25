#!/usr/bin/env python3
"""Interactively build SHIFT Code Manager releases or test artifacts."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
from zipfile import ZIP_DEFLATED, ZipFile

REPO_ROOT = Path(__file__).resolve().parent.parent
CHROME_MANIFEST = REPO_ROOT / "manifest.chrome.json"
FIREFOX_MANIFEST = REPO_ROOT / "manifest.firefox.json"
DEFAULT_MANIFEST = CHROME_MANIFEST
CHANGELOG_PATH = REPO_ROOT / "CHANGELOG.md"
PACKAGE_JSON = REPO_ROOT / "package.json"
PACKAGE_LOCK = REPO_ROOT / "package-lock.json"
DIST_DIR = REPO_ROOT / "dist"
PACKAGE_TEMPLATE = "shift-code-manager-{version}.zip"
TEST_PACKAGE_SUFFIX = "test"
PACKAGE_ENTRIES: Sequence[str] = (
    "manifest.chrome.json",
    "popup.html",
    "redeem-runner.js",
    "help.html",
    "help.js",
    "code_states.html",
    "code_states.js",
    "shift-config.js",
    "popup.js",
    "background.js",
    "shift-handler.js",
    "assets",
    "LICENSE",
    "PRIVACY.md",
    "CHANGELOG.md",
)


class BuildError(RuntimeError):
    """Custom error raised when the build pipeline fails."""


@dataclass
class Commit:
    sha: str
    date: datetime
    summary: str


@dataclass
class Release:
    label: str
    date: datetime
    commits: List[Commit]


_RTYPE_PATTERN = re.compile(r"^(?P<type>[a-z]+)(?:\([^)]+\))?:\s*(?P<rest>.+)$")


_CATEGORY_ORDER = (
    "Features",
    "Fixes",
    "Chore",
    "Other",
)
_CATEGORY_PREFIXES: Dict[str, Sequence[str]] = {
    "Features": ("feat", "feature"),
    "Fixes": ("fix", "hotfix", "bug"),
    "Chore": ("chore", "build", "ci", "docs", "doc", "refactor", "style", "perf", "test", "tests"),
    "Other": tuple(),
}


def _run_git(args: Sequence[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        raise BuildError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def _run_npm(args: Sequence[str]) -> None:
    result = subprocess.run(
        ["npm", *args],
        cwd=REPO_ROOT,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        raise BuildError(result.stderr.strip() or f"npm {' '.join(args)} failed")


def _ensure_git_repo() -> None:
    if _run_git(["rev-parse", "--is-inside-work-tree"]) != "true":
        raise BuildError("Not inside a git work tree. Run the build script from the repository root.")


def _ensure_clean_worktree() -> None:
    status = _run_git(["status", "--porcelain"])
    if status:
        raise BuildError("Uncommitted changes detected. Please commit or stash them before creating a release build.")


def _load_manifest(path: Path) -> dict:
    if not path.exists():
        raise BuildError(f"Manifest not found at {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise BuildError(f"Unable to parse manifest: {exc}") from exc


def _write_manifest(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=4) + "\n", encoding="utf-8")


def _write_package_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _validate_version(version: str) -> None:
    if not version:
        raise BuildError("Version string is empty")
    parts = version.split(".")
    if any(not part.isdigit() for part in parts):
        raise BuildError("Version must contain only numeric segments separated by dots")


def _bump_version(version: str, bump: str) -> str:
    parts = [int(part) for part in version.split(".")]
    if len(parts) < 2:
        parts.append(0)
    if bump == "major":
        parts[0] += 1
        if len(parts) > 1:
            parts[1] = 0
        else:
            parts.append(0)
    elif bump == "minor":
        parts[1] += 1
    else:
        raise BuildError(f"Unsupported bump type '{bump}'")
    return ".".join(str(part) for part in parts)


def _iter_package_paths(entries: Sequence[str]) -> Iterable[Path]:
    for entry in entries:
        path = REPO_ROOT / entry
        if path.is_dir():
            for file_path in sorted(path.rglob("*")):
                if file_path.is_file():
                    yield file_path
        elif path.is_file():
            yield path
        else:
            raise BuildError(f"Package entry missing: {entry}")


def _build_zip(version: str, *, suffix: Optional[str] = None, manifest_path: Optional[Path] = None) -> Path:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    filename = PACKAGE_TEMPLATE.format(version=version)
    if suffix:
        stem, ext = filename.rsplit(".", 1)
        filename = f"{stem}-{suffix}.{ext}"
    artifact_path = DIST_DIR / filename
    if manifest_path and not manifest_path.exists():
        raise BuildError(f"Manifest override not found at {manifest_path}")
    with ZipFile(artifact_path, "w", ZIP_DEFLATED) as zf:
        for file_path in _iter_package_paths(PACKAGE_ENTRIES):
            if file_path == CHROME_MANIFEST:
                source_path = manifest_path or file_path
                zf.write(source_path, "manifest.json")
                continue
            arcname = file_path.relative_to(REPO_ROOT)
            zf.write(file_path, arcname.as_posix())
    return artifact_path


def _build_release_artifacts(version: str, *, test_build: bool) -> List[Path]:
    chrome_suffix = TEST_PACKAGE_SUFFIX if test_build else None
    firefox_suffix = f"{TEST_PACKAGE_SUFFIX}-firefox" if test_build else "firefox"
    artifacts = [
        _build_zip(version, suffix=chrome_suffix),
        _build_zip(version, suffix=firefox_suffix, manifest_path=FIREFOX_MANIFEST),
    ]
    return artifacts


def _stage_and_commit(version: str, paths: Sequence[Path]) -> None:
    rel_paths = [str(path.relative_to(REPO_ROOT)) for path in paths if path.exists()]
    if not rel_paths:
        raise BuildError("Nothing to commit; release aborted.")
    _run_git(["add", *rel_paths])
    diff_proc = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO_ROOT, check=False)
    if diff_proc.returncode == 0:
        raise BuildError("No staged changes detected; edit the changelog before continuing.")
    if diff_proc.returncode not in (0, 1):
        raise BuildError("Unable to verify staged changes.")
    message = f"chore: release v{version}"
    _run_git(["commit", "-m", message])


def _create_tag(version: str) -> None:
    if _run_git(["tag", "-l", version]):
        raise BuildError(f"A git tag named {version} already exists.")
    _run_git(["tag", "-a", version, "-m", f"Release {version}"])


def _push_release() -> None:
    try:
        _run_git(["push"])
    except BuildError as exc:
        raise BuildError(
            "Failed to push release commit. Configure an upstream (git push -u origin <branch>) and try again."
        ) from exc
    try:
        _run_git(["push", "--tags"])
    except BuildError as exc:
        raise BuildError("Release commit pushed, but pushing tags failed: " + str(exc)) from exc


def _commit_range(current: str, previous: Optional[str]) -> str:
    return f"{previous}..{current}" if previous else current


def _parse_commit_line(raw: str) -> Commit:
    sha, date_str, summary = raw.split("\x1f", 2)
    return Commit(sha=sha, date=datetime.strptime(date_str, "%Y-%m-%d"), summary=summary)


def _collect_commits(rev_range: str) -> List[Commit]:
    output = _run_git([
        "log",
        rev_range,
        "--pretty=format:%h\x1f%cs\x1f%s",
        "--date-order",
        "--no-merges",
    ])
    if not output:
        return []
    return [_parse_commit_line(line) for line in output.splitlines()]


def _derive_label(
    ref: str,
    manifest_version: Optional[str],
    latest_tag_label: Optional[str],
) -> str:
    if ref == "HEAD":
        if manifest_version:
            if manifest_version == latest_tag_label:
                return f"{manifest_version} (unreleased)"
            return manifest_version
        return "Unreleased"
    if ref.startswith("v") and len(ref) > 1:
        return ref[1:]
    return ref


def _commit_category(summary: str) -> str:
    lowered = summary.lower()
    for category, prefixes in _CATEGORY_PREFIXES.items():
        if not prefixes:
            continue
        for prefix in prefixes:
            if lowered.startswith(prefix + ":") or lowered.startswith(prefix + "(") or lowered.startswith(prefix + " "):
                return category
    return "Other"


def _clean_summary(summary: str) -> str:
    match = _RTYPE_PATTERN.match(summary)
    if match:
        return match.group("rest").strip().capitalize()
    return summary[:1].upper() + summary[1:] if summary else summary


def _release_date(ref: str) -> datetime:
    raw_date = _run_git(["log", "-1", ref, "--pretty=format:%cs"])
    return datetime.strptime(raw_date, "%Y-%m-%d")


def _gather_refs() -> List[str]:
    tags = [tag for tag in _run_git(["tag", "--sort=creatordate"]).splitlines() if tag]
    if not tags:
        raise BuildError(
            "No git tags found. Tag previous releases (e.g. 'git tag 1.0 <commit>') before generating a release."
        )
    try:
        head_sha = _run_git(["rev-parse", "HEAD"])
        latest_tag_sha = _run_git(["rev-parse", tags[-1]])
    except BuildError:
        return tags + ["HEAD"]
    if head_sha != latest_tag_sha:
        tags.append("HEAD")
    return tags


def _build_releases(manifest_version: Optional[str]) -> List[Release]:
    refs = _gather_refs()
    releases: List[Release] = []
    previous: Optional[str] = None
    latest_tag_label: Optional[str] = None
    for candidate in reversed(refs):
        if candidate == "HEAD":
            continue
        latest_tag_label = candidate[1:] if candidate.startswith("v") and len(candidate) > 1 else candidate
        break
    for ref in refs:
        commits = _collect_commits(_commit_range(ref, previous))
        releases.append(
            Release(
                label=_derive_label(ref, manifest_version, latest_tag_label),
                date=_release_date(ref),
                commits=commits,
            )
        )
        previous = ref
    releases.reverse()
    return releases


def _format_release(release: Release) -> str:
    header = f"## {release.label} - {release.date.strftime('%Y-%m-%d')}"
    buckets: Dict[str, List[str]] = {category: [] for category in _CATEGORY_ORDER}
    for commit in release.commits:
        category = _commit_category(commit.summary)
        buckets.setdefault(category, [])
        cleaned = _clean_summary(commit.summary)
        buckets[category].append(f"- {cleaned} ({commit.sha})")
    lines = [header, ""]
    for category in _CATEGORY_ORDER:
        lines.append(f"### {category}")
        entries = buckets.get(category) or []
        if entries:
            lines.extend(entries)
        else:
            lines.append("- _")
        lines.append("")
    if lines[-1] != "":
        lines.append("")
    return "\n".join(lines).rstrip()


def generate_changelog(manifest_path: Path, output_path: Path) -> None:
    _ensure_git_repo()
    try:
        manifest_version = None
        if manifest_path.exists():
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest_version = str(data.get("version")) if data.get("version") is not None else None
    except json.JSONDecodeError as exc:
        raise BuildError(f"Failed to parse {manifest_path}: {exc}") from exc
    releases = _build_releases(manifest_version)
    header = "# Changelog\n"
    body = "\n\n".join(_format_release(release) for release in releases)
    output_path.write_text(f"{header}\n{body}\n", encoding="utf-8")


def _prompt_choice(current_version: str) -> Tuple[str, Dict[str, str]]:
    previews = {
        "major": _bump_version(current_version, "major"),
        "minor": _bump_version(current_version, "minor"),
    }
    options = [
        ("test", f"Test build (no version bump)"),
        ("major", f"Bump major ({previews['major']})"),
        ("minor", f"Bump minor ({previews['minor']})"),
    ]
    print("What kind of build do you want to create?\n")
    for idx, (_, label) in enumerate(options, start=1):
        print(f"{idx}) {label}")
    while True:
        choice = input("Select option [1-3, default 1]: ").strip()
        if not choice:
            choice = "1"
        if choice in {"1", "2", "3"}:
            selected = options[int(choice) - 1][0]
            return selected, previews
        print("Please enter 1, 2, or 3.")


def _confirm_manifest_version(manifest: dict) -> str:
    version = str(manifest.get("version", ""))
    if not version:
        raise BuildError("Current manifest version missing")
    _validate_version(version)
    return version


def main() -> int:
    manifest_path = DEFAULT_MANIFEST
    try:
        manifest = _load_manifest(manifest_path)
        current_version = _confirm_manifest_version(manifest)
        selection, previews = _prompt_choice(current_version)

        if selection == "test":
            artifacts = _build_release_artifacts(current_version, test_build=True)
            rel_paths = ", ".join(str(path.relative_to(REPO_ROOT)) for path in artifacts)
            print(f"✅ Test builds ready: {rel_paths}")
            return 0

        _ensure_clean_worktree()
        new_version = previews[selection]
        _validate_version(new_version)
        original_manifest_text = manifest_path.read_text(encoding="utf-8")
        original_firefox_manifest_text = FIREFOX_MANIFEST.read_text(encoding="utf-8") if FIREFOX_MANIFEST.exists() else None
        original_changelog_text = CHANGELOG_PATH.read_text(encoding="utf-8") if CHANGELOG_PATH.exists() else None
        original_package_text = PACKAGE_JSON.read_text(encoding="utf-8") if PACKAGE_JSON.exists() else None
        original_package_lock_text = PACKAGE_LOCK.read_text(encoding="utf-8") if PACKAGE_LOCK.exists() else None
        manifest["version"] = new_version
        _write_manifest(manifest_path, manifest)
        if original_firefox_manifest_text is not None:
            firefox_manifest = _load_manifest(FIREFOX_MANIFEST)
            firefox_manifest["version"] = new_version
            _write_manifest(FIREFOX_MANIFEST, firefox_manifest)
        if PACKAGE_JSON.exists():
            try:
                package_data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                raise BuildError(f"Unable to parse {PACKAGE_JSON}: {exc}") from exc
            package_data["version"] = new_version
            _write_package_json(PACKAGE_JSON, package_data)
        if PACKAGE_LOCK.exists() and PACKAGE_JSON.exists():
            _run_npm(["install", "--package-lock-only"])
        artifact_path: Optional[Path] = None
        commit_created = False
        tag_created = False
        push_completed = False
        try:
            generate_changelog(manifest_path, CHANGELOG_PATH)
            print("Changelog regenerated with Features/Fixes/Chore/Other sections.")
            print("Review and edit manifest.chrome.json, manifest.firefox.json, and CHANGELOG.md as needed.")
            try:
                input("Press Enter to package and commit, or Ctrl+C to cancel: ")
            except KeyboardInterrupt as exc:  # pragma: no cover - user abort
                raise BuildError("Release cancelled.") from exc
            artifacts = _build_release_artifacts(new_version, test_build=False)
            artifact_path = artifacts[0]
            paths_to_commit = [manifest_path, CHANGELOG_PATH]
            if FIREFOX_MANIFEST.exists():
                paths_to_commit.append(FIREFOX_MANIFEST)
            if PACKAGE_JSON.exists():
                paths_to_commit.append(PACKAGE_JSON)
            if PACKAGE_LOCK.exists():
                paths_to_commit.append(PACKAGE_LOCK)
            _stage_and_commit(new_version, paths_to_commit)
            commit_created = True
            _create_tag(new_version)
            tag_created = True
            _push_release()
            push_completed = True
        except Exception as exc:  # noqa: BLE001 - ensure state rolls back
            if not commit_created:
                manifest_path.write_text(original_manifest_text, encoding="utf-8")
                if original_firefox_manifest_text is None:
                    if FIREFOX_MANIFEST.exists():
                        FIREFOX_MANIFEST.unlink()
                else:
                    FIREFOX_MANIFEST.write_text(original_firefox_manifest_text, encoding="utf-8")
                if original_changelog_text is None:
                    if CHANGELOG_PATH.exists():
                        CHANGELOG_PATH.unlink()
                else:
                    CHANGELOG_PATH.write_text(original_changelog_text, encoding="utf-8")
                if original_package_text is None:
                    if PACKAGE_JSON.exists():
                        PACKAGE_JSON.unlink()
                else:
                    PACKAGE_JSON.write_text(original_package_text, encoding="utf-8")
                if original_package_lock_text is None:
                    if PACKAGE_LOCK.exists():
                        PACKAGE_LOCK.unlink()
                else:
                    PACKAGE_LOCK.write_text(original_package_lock_text, encoding="utf-8")
                try:
                    reset_paths = [
                        str(manifest_path.relative_to(REPO_ROOT)),
                        str(CHANGELOG_PATH.relative_to(REPO_ROOT)),
                    ]
                    if FIREFOX_MANIFEST.exists():
                        reset_paths.append(str(FIREFOX_MANIFEST.relative_to(REPO_ROOT)))
                    if PACKAGE_JSON.exists():
                        reset_paths.append(str(PACKAGE_JSON.relative_to(REPO_ROOT)))
                    if PACKAGE_LOCK.exists():
                        reset_paths.append(str(PACKAGE_LOCK.relative_to(REPO_ROOT)))
                    _run_git(["reset", "HEAD", *reset_paths])
                except BuildError:
                    pass
            if tag_created and not push_completed:
                try:
                    _run_git(["tag", "-d", new_version])
                except BuildError:
                    pass
            if artifact_path and artifact_path.exists():
                artifact_path.unlink()
            if isinstance(exc, BuildError):
                raise
            raise BuildError(str(exc)) from exc
        print(
            f"✅ Release ready: {artifact_path.relative_to(REPO_ROOT)} "
            f"(tag {new_version} created and pushed)"
        )
        return 0
    except BuildError as exc:
        sys.stderr.write(f"Error: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
