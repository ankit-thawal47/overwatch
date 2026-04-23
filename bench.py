#!/usr/bin/env python3
"""
Benchmark script for Overwatch API endpoints.
Run before and after optimisations to compare.

Usage:
    python bench.py                  # default 5 runs per endpoint
    python bench.py --runs 10
    python bench.py --host localhost:7474
"""
import argparse
import json
import statistics
import time
import urllib.request
from dataclasses import dataclass

BASE = "http://localhost:8080"
RUNS = 5


@dataclass
class Result:
    name: str
    times_ms: list[float]

    @property
    def mean(self): return statistics.mean(self.times_ms)
    @property
    def median(self): return statistics.median(self.times_ms)
    @property
    def p95(self): return sorted(self.times_ms)[int(len(self.times_ms) * 0.95)]
    @property
    def min(self): return min(self.times_ms)
    @property
    def max(self): return max(self.times_ms)


def fetch(url: str) -> tuple[float, str | None]:
    """Returns (elapsed_ms, X-Process-Time-Ms header or None)."""
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            resp.read()  # consume body
            elapsed = (time.perf_counter() - t0) * 1000
            server_ms = resp.headers.get("X-Process-Time-Ms")
            return elapsed, server_ms
    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        print(f"  ERROR {url}: {e}")
        return elapsed, None


def bench(name: str, url: str, runs: int) -> Result:
    client_times = []
    server_times = []
    print(f"  {name} ...", end="", flush=True)
    for i in range(runs):
        client_ms, server_ms = fetch(url)
        client_times.append(client_ms)
        if server_ms:
            server_times.append(float(server_ms))
        print(".", end="", flush=True)
    print()
    # prefer server-side time (excludes network stack overhead) if available
    times = server_times if server_times else client_times
    return Result(name=name, times_ms=times)


def get_first_session_id(base: str) -> str | None:
    try:
        with urllib.request.urlopen(f"{base}/api/sessions?limit=1", timeout=10) as r:
            data = json.loads(r.read())
            if data:
                return data[0]["id"]
    except Exception:
        pass
    return None


def get_first_project_id(base: str) -> str | None:
    try:
        with urllib.request.urlopen(f"{base}/api/projects?limit=1", timeout=10) as r:
            data = json.loads(r.read())
            if data:
                return data[0]["id"]
    except Exception:
        pass
    return None


def print_results(results: list[Result]):
    print()
    print(f"{'Endpoint':<35} {'median':>8} {'mean':>8} {'min':>8} {'max':>8}  (ms, server-side)")
    print("-" * 75)
    for r in results:
        print(f"{r.name:<35} {r.median:>8.0f} {r.mean:>8.0f} {r.min:>8.0f} {r.max:>8.0f}")
    print()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=RUNS)
    parser.add_argument("--host", default="localhost:8080")
    args = parser.parse_args()

    base = f"http://{args.host}"
    runs = args.runs

    print(f"\nOverwatch benchmark  —  {base}  —  {runs} runs each\n")

    # Discover real IDs so we benchmark realistic data
    print("Discovering IDs...")
    session_id = get_first_session_id(base)
    project_id = get_first_project_id(base)
    print(f"  session: {session_id}")
    print(f"  project: {project_id}")
    print()

    endpoints = [
        ("GET /sessions?limit=200",   f"{base}/api/sessions?limit=200"),
        ("GET /sessions?limit=50",    f"{base}/api/sessions?limit=50"),
        ("GET /projects",             f"{base}/api/projects"),
        ("GET /stats",                f"{base}/api/stats"),
    ]
    if session_id:
        endpoints += [
            ("GET /sessions/{id}",        f"{base}/api/sessions/{session_id}"),
            ("GET /sessions/{id}/messages", f"{base}/api/sessions/{session_id}/messages?limit=500"),
        ]
    if project_id:
        endpoints += [
            ("GET /projects/{id}",        f"{base}/api/projects/{project_id}"),
        ]

    print("Running benchmarks...")
    results = []
    for name, url in endpoints:
        r = bench(name, url, runs)
        results.append(r)

    print_results(results)


if __name__ == "__main__":
    main()
