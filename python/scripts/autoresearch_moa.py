#!/usr/bin/env python3
"""Autonomous MoA research loop for strategy tuning.

This script is intentionally cache-aware and dashboard-aware:
- discovers all healthy NVIDIA-hosted LLMs
- reads current strategies from the dashboard DB/API
- brainstorms, synthesizes, implements, and benchmarks candidates
- persists logs, cache, and model health so later sessions can resume cleanly

It is designed to run remotely and avoid heavy local compute.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import textwrap
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CACHE_DIR = Path(__file__).resolve().parent.parent / "custom" / "cache" / "autoresearch_moa"
AGENTS_DIR = CACHE_DIR / "agents"
LOG_FILE = CACHE_DIR / "research_log.md"
STATE_FILE = CACHE_DIR / "state.json"
MODEL_HEALTH_FILE = CACHE_DIR / "model_health.json"
BASELINE_AGENT_FILE = AGENTS_DIR / "baseline.py"
BEST_AGENT_FILE = AGENTS_DIR / "best.py"

DEFAULT_DASHBOARD_API = os.environ.get("DASHBOARD_API_URL", "http://localhost:8080/api/v1")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

LEAD_RESEARCHER_MODELS = [
    "meta/llama-3.3-70b-instruct",
    "meta/llama-3.1-70b-instruct",
    "qwen/qwen2.5-72b-instruct",
]

NUM_GENERATIONS = int(os.environ.get("MOA_GENERATIONS", "25"))
MATCHES_PER_EVAL = int(os.environ.get("MOA_MATCHES_PER_EVAL", "10"))
EPISODE_STEPS = int(os.environ.get("MOA_EPISODE_STEPS", "500"))
ACT_TIMEOUT = float(os.environ.get("MOA_ACT_TIMEOUT", "1.0"))
MAX_CONCURRENT_API_CALLS = int(os.environ.get("MOA_MAX_CONCURRENCY", "8"))
API_TEMPERATURE_BRAINSTORM = float(os.environ.get("MOA_BRAINSTORM_TEMP", "0.8"))
API_TEMPERATURE_CODE = float(os.environ.get("MOA_CODE_TEMP", "0.3"))
API_MAX_TOKENS = int(os.environ.get("MOA_MAX_TOKENS", "4096"))
API_RETRIES = int(os.environ.get("MOA_RETRIES", "3"))
API_RETRY_BASE_SLEEP_SEC = float(os.environ.get("MOA_RETRY_BASE_SLEEP_SEC", "2.0"))
HEARTBEAT_MAX_TOKENS = int(os.environ.get("MOA_HEARTBEAT_MAX_TOKENS", "16"))
HEARTBEAT_TIMEOUT_SEC = float(os.environ.get("MOA_HEARTBEAT_TIMEOUT_SEC", "20.0"))

logger = logging.getLogger("autoresearch_moa")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


@dataclass
class ModelHealth:
    model: str
    healthy: bool
    last_checked: float


@dataclass
class ResearchState:
    generation: int = 0
    last_master_plan: str = ""
    last_best_model: str = ""
    last_best_win_rate: float = 0.0
    last_best_diff: float = 0.0


def ensure_workspace() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    AGENTS_DIR.mkdir(parents=True, exist_ok=True)
    if not BASELINE_AGENT_FILE.exists():
        raise FileNotFoundError(f"Missing baseline file: {BASELINE_AGENT_FILE}")
    if not BEST_AGENT_FILE.exists():
        BEST_AGENT_FILE.write_text(BASELINE_AGENT_FILE.read_text(encoding="utf-8"), encoding="utf-8")
    if not LOG_FILE.exists():
        LOG_FILE.write_text("# MoA Research Log\n\nInitial baseline established.\n", encoding="utf-8")
    if not STATE_FILE.exists():
        STATE_FILE.write_text(json.dumps(asdict(ResearchState()), indent=2), encoding="utf-8")
    if not MODEL_HEALTH_FILE.exists():
        MODEL_HEALTH_FILE.write_text("[]", encoding="utf-8")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def safe_extract_python_code(text: str) -> str:
    match = re.search(r"```python\s*\n(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    match = re.search(r"```\s*\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()


def truncate_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 20] + "\n...[truncated]..."


def http_get_json(url: str) -> dict:
    request = Request(url, method="GET")
    with urlopen(request, timeout=30) as response:
        payload = response.read().decode("utf-8")
    return json.loads(payload)


def fetch_dashboard_strategies(api_base: str) -> List[dict]:
    try:
        payload = http_get_json(f"{api_base}/strategies?include_inactive=true")
        if isinstance(payload, list):
            return payload
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("Failed to fetch dashboard strategies: %s", exc)
    return []


def summarize_strategies(strategies: Iterable[dict], limit: int = 40) -> str:
    rows: List[str] = []
    for strategy in list(strategies)[:limit]:
        rows.append(
            "- "
            + f"{strategy.get('name', 'unknown')} | "
            + f"code_key={strategy.get('code_key')} | "
            + f"status={strategy.get('status')} | "
            + f"active={strategy.get('is_active')} | "
            + f"source={strategy.get('source_path')} | "
            + f"params={truncate_text(json.dumps(strategy.get('parameters', {}), ensure_ascii=False), 600)}"
        )
    return "\n".join(rows)


def get_openai_client():
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY is not set")
    from openai import OpenAI

    return OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=NVIDIA_API_KEY,
        max_retries=0,
        timeout=600.0,
    )


def get_available_chat_models() -> List[str]:
    client = get_openai_client()
    try:
        models_page = client.models.list()
        all_models = [m.id for m in getattr(models_page, "data", []) if getattr(m, "id", None)]
        exclude_terms = ["embed", "vision", "rerank", "nemotron-qa", "translate", "multimodal"]
        chat_models = sorted(
            [
                model
                for model in all_models
                if ("instruct" in model.lower() or "chat" in model.lower() or "coder" in model.lower())
                and not any(term in model.lower() for term in exclude_terms)
            ]
        )
        return chat_models
    except Exception as exc:
        logger.error("Failed to list models: %s", exc)
        return []


def heartbeat_model(model_name: str) -> Optional[ModelHealth]:
    client = get_openai_client()
    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": "Reply OK"}],
            max_tokens=HEARTBEAT_MAX_TOKENS,
            timeout=HEARTBEAT_TIMEOUT_SEC,
        )
        healthy = bool(response.choices and response.choices[0].message.content)
        return ModelHealth(model=model_name, healthy=healthy, last_checked=time.time())
    except Exception:
        return ModelHealth(model=model_name, healthy=False, last_checked=time.time())


def filter_healthy_models(models: List[str]) -> List[str]:
    cached_health = {entry["model"]: entry for entry in read_json(MODEL_HEALTH_FILE, []) if isinstance(entry, dict) and entry.get("model")}
    now = time.time()
    fresh_models: List[str] = []
    stale_models: List[str] = []

    for model in models:
        cached = cached_health.get(model)
        if cached and now - float(cached.get("last_checked", 0)) < 24 * 3600:
            if cached.get("healthy"):
                fresh_models.append(model)
            continue
        stale_models.append(model)

    logger.info("Running parallel health checks on %d model(s)...", len(stale_models))
    if stale_models:
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_API_CALLS) as executor:
            futures = {executor.submit(heartbeat_model, model): model for model in stale_models}
            for future in as_completed(futures):
                result = future.result()
                cached_health[result.model] = asdict(result)
                if result.healthy:
                    fresh_models.append(result.model)

    write_json(MODEL_HEALTH_FILE, list(cached_health.values()))
    return sorted(set(fresh_models))


def prompt_model(model_name: str, system_prompt: str, user_prompt: str, temperature: float, is_code: bool = False) -> Optional[str]:
    client = get_openai_client()
    last_err = None
    for attempt in range(1, API_RETRIES + 1):
        try:
            response_stream = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_tokens=API_MAX_TOKENS,
                stream=True,
            )
            chunks: List[str] = []
            for chunk in response_stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    chunks.append(chunk.choices[0].delta.content)
            full_content = "".join(chunks).strip()
            if not full_content:
                raise ValueError("Empty string returned")
            return safe_extract_python_code(full_content) if is_code else full_content
        except Exception as exc:
            err_str = str(exc).lower()
            if any(term in err_str for term in ["maximum context length", "degraded", "not found", "400"]):
                logger.warning("Skipping model %s due to hard constraint: %s", model_name, exc)
                return None
            last_err = exc
            time.sleep(API_RETRY_BASE_SLEEP_SEC * (2 ** (attempt - 1)))
    logger.warning("Model %s failed after %d retries: %s", model_name, API_RETRIES, last_err)
    return None


def check_syntax(code_string: str) -> Tuple[bool, Optional[str]]:
    try:
        compile(code_string, "<candidate>", "exec")
        return True, None
    except Exception as exc:
        return False, str(exc)


def evaluate_agent(test_agent_path: Path, baseline_agent_path: Path, num_matches: int) -> Tuple[float, float, Optional[str]]:
    from kaggle_environments import make

    env = make("orbit_wars", configuration={"episodeSteps": EPISODE_STEPS, "actTimeout": ACT_TIMEOUT})
    wins = 0
    total_ships = 0
    total_baseline_ships = 0

    for index in range(num_matches):
        env.reset()
        agents = [str(test_agent_path), str(baseline_agent_path)] if index % 2 == 0 else [str(baseline_agent_path), str(test_agent_path)]
        idx_test, idx_base = ((0, 1) if index % 2 == 0 else (1, 0))
        try:
            outcomes = env.run(agents)
            obs_test = outcomes[-1][idx_test].observation
            obs_base = outcomes[-1][idx_base].observation
            pid_test = obs_test.get("player", idx_test)
            pid_base = obs_base.get("player", idx_base)
            ships_test = sum(p[5] for p in (obs_test.get("planets") or []) if p[1] == pid_test) + sum(
                f[6] for f in (obs_test.get("fleets") or []) if f[1] == pid_test
            )
            ships_base = sum(p[5] for p in (obs_base.get("planets") or []) if p[1] == pid_base) + sum(
                f[6] for f in (obs_base.get("fleets") or []) if f[1] == pid_base
            )
            total_ships += ships_test
            total_baseline_ships += ships_base
            if ships_test > ships_base:
                wins += 1
        except Exception as exc:
            return 0.0, 0.0, str(exc)

    return wins / float(num_matches), (total_ships - total_baseline_ships) / float(num_matches), None


def append_log(title: str, body: str) -> None:
    existing = read_text(LOG_FILE)
    entry = f"\n## {title}\n{body}\n"
    write_text(LOG_FILE, existing + entry)


def load_state() -> ResearchState:
    raw = read_json(STATE_FILE, {})
    return ResearchState(
        generation=int(raw.get("generation", 0)),
        last_master_plan=str(raw.get("last_master_plan", "")),
        last_best_model=str(raw.get("last_best_model", "")),
        last_best_win_rate=float(raw.get("last_best_win_rate", 0.0)),
        last_best_diff=float(raw.get("last_best_diff", 0.0)),
    )


def save_state(state: ResearchState) -> None:
    write_json(STATE_FILE, asdict(state))


def build_context(api_base: str) -> str:
    strategies = fetch_dashboard_strategies(api_base)
    strategy_summary = summarize_strategies(strategies)
    return truncate_text(strategy_summary, 18000)


def run_autoresearch(api_base: str) -> None:
    ensure_workspace()
    state = load_state()

    available_models = get_available_chat_models()
    if not available_models:
        logger.error("No models found from NVIDIA API. Aborting.")
        return

    healthy_models = filter_healthy_models(available_models)
    if not healthy_models:
        logger.error("No healthy models available. Aborting.")
        return

    logger.info("Engaging %d healthy models for MoA autoresearch.", len(healthy_models))
    lead_researcher = next((model for model in LEAD_RESEARCHER_MODELS if model in healthy_models), healthy_models[-1])
    logger.info("Lead Researcher designated as: %s", lead_researcher)

    dashboard_context = build_context(api_base)
    current_code = read_text(BEST_AGENT_FILE)

    for generation in range(state.generation + 1, NUM_GENERATIONS + 1):
        logger.info("==================================================")
        logger.info("GENERATION %d", generation)
        logger.info("==================================================")

        brainstorm_sys = textwrap.dedent(
            """
            You are an AI researcher optimizing a Python agent for Orbit Wars.
            Read the current strategy context and propose ONE specific, actionable algorithmic change.
            Keep it under 100 words. Do not write code.
            """
        ).strip()
        brainstorm_user = f"CURRENT STRATEGIES:\n{dashboard_context}\n\nCURRENT CODE:\n{truncate_text(current_code, 20000)}"

        proposals: List[str] = []
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_API_CALLS) as executor:
            futures = {
                executor.submit(prompt_model, model, brainstorm_sys, brainstorm_user, API_TEMPERATURE_BRAINSTORM, False): model
                for model in healthy_models
            }
            for future in as_completed(futures):
                model = futures[future]
                proposal = future.result()
                if proposal:
                    proposals.append(f"Proposal from {model}:\n{proposal}")

        if not proposals:
            logger.error("Brainstorming failed. Retrying next generation.")
            continue

        synth_sys = textwrap.dedent(
            """
            You are the Lead AI Researcher.
            Select the SINGLE BEST proposal and write one definitive instruction to modify the baseline agent.
            Do not output a laundry list. Do not write code. Keep it under 150 words.
            """
        ).strip()
        synth_user = "PROPOSALS:\n" + "\n\n".join(proposals)
        master_plan = prompt_model(lead_researcher, synth_sys, synth_user, 0.2, False)
        if not master_plan:
            logger.error("Synthesis failed. Retrying next generation.")
            continue

        logger.info("Master Plan formulated:\n%s", master_plan)

        implement_sys = textwrap.dedent(
            """
            You are an expert Python engineer.
            Modify the provided Orbit Wars baseline agent exactly according to the MASTER PLAN.
            Output only valid Python code in a single code block.
            """
        ).strip()
        implement_user = f"MASTER PLAN:\n{master_plan}\n\nBASELINE CODE:\n```python\n{current_code}\n```"

        candidates: Dict[str, Path] = {}
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_API_CALLS) as executor:
            futures = {
                executor.submit(prompt_model, model, implement_sys, implement_user, API_TEMPERATURE_CODE, True): model
                for model in healthy_models
            }
            for future in as_completed(futures):
                model = futures[future]
                code = future.result()
                if not code:
                    continue
                is_valid, error = check_syntax(code)
                if not is_valid:
                    logger.debug("Model %s syntax error: %s", model, error)
                    continue
                safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", model.split("/")[-1])
                candidate_path = AGENTS_DIR / f"gen{generation}_{safe_name}.py"
                write_text(candidate_path, code)
                candidates[model] = candidate_path

        if not candidates:
            logger.warning("No candidates produced valid code. Skipping evaluation.")
            continue

        results = []
        for model, path in candidates.items():
            win_rate, avg_diff, error = evaluate_agent(path, BEST_AGENT_FILE, MATCHES_PER_EVAL)
            results.append((model, path, win_rate, avg_diff, error))

        results.sort(key=lambda item: (item[2], item[3]), reverse=True)
        best_model, best_path, best_wr, best_diff, best_err = results[0]

        journal = [f"**Master Plan:**\n{master_plan}\n", "**Results:**"]
        for model, _, wr, diff, error in results:
            if error:
                journal.append(f"- {model}: Crashed ({error})")
            else:
                journal.append(f"- {model}: {wr * 100:.1f}% win rate (diff {diff:.2f})")

        if best_err is None and best_wr > 0.50:
            logger.info("Breakthrough! %s achieved %.2f win rate.", best_model, best_wr)
            write_text(BEST_AGENT_FILE, read_text(best_path))
            journal.append(f"**Conclusion:** Hypothesis successful. {best_model} became the new baseline.")
        else:
            logger.info("No candidate beat the baseline. Retaining current baseline.")
            journal.append("**Conclusion:** Hypothesis failed to beat baseline.")

        append_log(f"Generation {generation}", "\n".join(journal))
        state.generation = generation
        state.last_master_plan = master_plan
        state.last_best_model = best_model
        state.last_best_win_rate = best_wr
        state.last_best_diff = best_diff
        save_state(state)
        time.sleep(2.0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Autonomous MoA research loop for Orbit Wars")
    parser.add_argument("--dashboard-api", default=DEFAULT_DASHBOARD_API, help="Dashboard API base URL")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run_autoresearch(args.dashboard_api)


if __name__ == "__main__":
    main()
