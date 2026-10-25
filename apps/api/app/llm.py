"""Chat-completion providers. Azure OpenAI or OpenAI when configured, otherwise none."""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass

import httpx


@dataclass
class Provider:
    name: str
    model: str
    url: str
    headers: dict[str, str]
    send_model: bool


def configured_provider() -> Provider | None:
    choice = os.getenv("AI_PROVIDER", "auto").lower()
    if choice == "simulated":
        return None

    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    azure_key = os.getenv("AZURE_OPENAI_API_KEY")
    if choice in ("auto", "azure") and endpoint and azure_key:
        deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
        version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21")
        return Provider(
            name="Azure OpenAI",
            model=deployment,
            url=f"{endpoint.rstrip('/')}/openai/deployments/{deployment}/chat/completions?api-version={version}",
            headers={"api-key": azure_key},
            send_model=False,
        )

    openai_key = os.getenv("OPENAI_API_KEY")
    if choice in ("auto", "openai") and openai_key:
        base = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        return Provider(
            name="OpenAI",
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            url=f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {openai_key}"},
            send_model=True,
        )
    return None


async def chat(provider: Provider, messages: list[dict], timeout: float = 30.0, max_tokens: int = 500) -> tuple[str, dict]:
    body: dict = {"messages": messages, "temperature": 0.2, "max_tokens": max_tokens}
    if provider.send_model:
        body["model"] = provider.model
    async with httpx.AsyncClient(timeout=timeout) as client:
        # Small sandbox quotas return 429 after a few quick questions: wait as told and retry.
        for attempt in range(3):
            r = await client.post(provider.url, headers=provider.headers, json=body)
            if r.status_code != 429 or attempt == 2:
                break
            await asyncio.sleep(min(float(r.headers.get("retry-after", 5)), 20))
        r.raise_for_status()
        data = r.json()
    return data["choices"][0]["message"]["content"].strip(), data.get("usage", {})
