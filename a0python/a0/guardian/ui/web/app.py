"""Guardian web UI — Gradio application.

Three tabs:
    chat               — converse with AgentZero
    interdependentway  — live view of interdependentway.org
    settings           — edit .env (model, API key, port, host)

Launch::

    python -m a0.guardian.ui.web.app

Then open http://localhost:7860 (or the configured A0_HOST:A0_PORT).

Guardian owns the UI (Law 10).
"""
from __future__ import annotations

import importlib
from pathlib import Path

import gradio as gr

from a0.agent import AgentZero
import a0.cores.psi.tensors.env as _env

_agent = AgentZero()

# ---------------------------------------------------------------------------
# CSS — clean, minimal, focused
# ---------------------------------------------------------------------------

_CSS = """
/* hide gradio footer branding */
footer { display: none !important; }

/* constrain max width for readability */
.gradio-container {
    max-width: 1100px !important;
    margin: 0 auto !important;
    font-family: "Inter", "Helvetica Neue", sans-serif;
}

/* tab nav — cleaner spacing */
.tab-nav button {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
    padding: 8px 20px;
}

/* chat input row */
.chat-row { align-items: flex-end; gap: 8px; }

/* settings groups */
.settings-group {
    border: 1px solid var(--border-color-primary);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
}

/* status message in settings */
.status-ok  { color: #22c55e; font-weight: 500; }
.status-err { color: #ef4444; font-weight: 500; }

/* iframe container */
.browser-frame {
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border-color-primary);
}
"""

# ---------------------------------------------------------------------------
# Chat tab helpers
# ---------------------------------------------------------------------------

def _chat_respond(message: str, history: list) -> tuple[str, list]:
    """Call AgentZero and append the exchange to history."""
    if not message.strip():
        return "", history

    history = list(history or [])
    resp = _agent.run(message.strip(), history=history)
    text = resp.result.get("text", "")
    if resp.hmmm:
        text += f"\n\n*hmmm: {resp.hmmm}*"

    history.append({"role": "user", "content": message.strip()})
    history.append({"role": "assistant", "content": text})
    return "", history


def _build_chat_tab() -> None:
    with gr.Tab("chat"):
        chatbot = gr.Chatbot(
            label="",
            height=520,
            type="messages",
            bubble_full_width=False,
            show_copy_button=True,
            avatar_images=(None, None),
        )
        with gr.Row(elem_classes="chat-row"):
            msg_box = gr.Textbox(
                placeholder="speak to a0…",
                show_label=False,
                container=False,
                scale=9,
                autofocus=True,
            )
            send_btn = gr.Button("→", variant="primary", scale=1, min_width=52)
        clear_btn = gr.Button("clear conversation", variant="secondary", size="sm")

        send_btn.click(
            fn=_chat_respond,
            inputs=[msg_box, chatbot],
            outputs=[msg_box, chatbot],
        )
        msg_box.submit(
            fn=_chat_respond,
            inputs=[msg_box, chatbot],
            outputs=[msg_box, chatbot],
        )
        clear_btn.click(
            fn=lambda: ("", []),
            outputs=[msg_box, chatbot],
        )


# ---------------------------------------------------------------------------
# Browser tab
# ---------------------------------------------------------------------------

_IFRAME_HTML = """
<div class="browser-frame">
  <iframe
    src="https://interdependentway.org"
    style="width:100%; height:82vh; border:none; display:block;"
    title="interdependentway.org"
    loading="lazy">
  </iframe>
</div>
"""


def _build_browser_tab() -> None:
    with gr.Tab("interdependentway.org"):
        gr.HTML(_IFRAME_HTML)


# ---------------------------------------------------------------------------
# Settings tab helpers
# ---------------------------------------------------------------------------

def _save_settings(model: str, api_key: str, port: int, host: str) -> str:
    env_path: Path = _env.ENV_PATH
    lines = [
        f"A0_MODEL={model}",
        f"ANTHROPIC_API_KEY={api_key}",
        f"A0_PORT={int(port)}",
        f"A0_HOST={host}",
    ]
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Reload env module so the running process picks up new values
    importlib.reload(_env)

    return f"<span class='status-ok'>✓ saved to {env_path}</span>"


def _build_settings_tab() -> None:
    with gr.Tab("settings ⚙"):
        gr.Markdown("### model adapter")
        with gr.Group(elem_classes="settings-group"):
            model_dd = gr.Dropdown(
                choices=["local-echo", "local-ollama", "local-llama",
                         "anthropic-api", "claude-agent"],
                label="A0_MODEL",
                value=_env.A0_MODEL,
                info="local-ollama: ollama daemon. local-llama: embedded llama-cpp. anthropic-api: Anthropic API.",
            )
            api_key_box = gr.Textbox(
                label="ANTHROPIC_API_KEY",
                type="password",
                value=_env.ANTHROPIC_API_KEY,
                placeholder="sk-ant-… (required for anthropic-api)",
            )

        gr.Markdown("### server")
        with gr.Group(elem_classes="settings-group"):
            port_num = gr.Number(
                label="A0_PORT",
                value=_env.A0_PORT,
                precision=0,
                info="Port the Gradio server listens on. Restart required to change.",
            )
            host_box = gr.Textbox(
                label="A0_HOST",
                value=_env.A0_HOST,
                info="0.0.0.0 = all interfaces (GCP accessible). 127.0.0.1 = local only.",
            )

        save_btn = gr.Button("save", variant="primary")
        status_md = gr.HTML("")

        save_btn.click(
            fn=_save_settings,
            inputs=[model_dd, api_key_box, port_num, host_box],
            outputs=status_md,
        )


# ---------------------------------------------------------------------------
# App assembly
# ---------------------------------------------------------------------------

def build_app() -> gr.Blocks:
    theme = gr.themes.Soft(
        primary_hue="slate",
        secondary_hue="slate",
        neutral_hue="slate",
        radius_size=gr.themes.sizes.radius_sm,
        font=[gr.themes.GoogleFont("Inter"), "Helvetica Neue", "sans-serif"],
    )

    with gr.Blocks(
        theme=theme,
        title="a0 — interdependent way",
        css=_CSS,
    ) as demo:
        gr.Markdown(
            "## a0\n*PTCA cognitive routing shell — interdependent way*",
        )

        _build_chat_tab()
        _build_browser_tab()
        _build_settings_tab()

    return demo


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    from a0.cores.psi.tensors.env import A0_HOST, A0_PORT

    demo = build_app()
    demo.launch(
        server_name=A0_HOST,
        server_port=A0_PORT,
        share=False,
        show_error=True,
    )


if __name__ == "__main__":
    main()
