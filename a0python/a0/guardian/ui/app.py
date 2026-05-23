# 58:74
"""A0App — Guardian's Textual TUI.

Layout:
┌─────────────────────────────────────────────────────┐
│  a0                                          hmmm:[] │
├────────┬─────────┬──────┬────────┬───────┬──────────┤
│ Core   │Transport│ Jury │ Memory │Meta-13│ Guardian │  ← Seeds (TabbedContent)
├────────┴─────────┴──────┴────────┴───────┴──────────┤
│                                                      │
│   ╭──────╮  ╭──────╮  ╭───────╮                     │
│   │ Phi  │  │ Psi  │  │ Omega │                     │  ← Circles (rounded widgets)
│   ╰──────╯  ╰──────╯  ╰───────╯                     │
│                                                      │
└─────────────────────────────────────────────────────┘

Each circle widget displays:
- name, label, seed
- active state (highlighted border)
- hmmm register (shown if non-empty)

Guardian owns the UI (Law 10).
"""
from __future__ import annotations

from typing import List

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal
from textual.reactive import reactive
from textual.widgets import Footer, Header, Label, Static, TabbedContent, TabPane

from .circles import Circle
from .seeds import Seed, SeedLayout, default_layout


class CircleWidget(Static):
    """A rounded widget representing a single Circle tab."""

    DEFAULT_CSS = """
    CircleWidget {
        border: round $primary;
        padding: 1 2;
        margin: 0 1;
        min-width: 12;
        height: 5;
        content-align: center middle;
    }
    CircleWidget.active {
        border: round $accent;
        background: $accent 20%;
    }
    CircleWidget.has-hmmm {
        border: round $warning;
    }
    """

    def __init__(self, circle: Circle) -> None:
        self._circle = circle
        label = circle.label
        if circle.hmmm:
            label += f"\nhmmm:{circle.hmmm}"
        super().__init__(label)
        if circle.active:
            self.add_class("active")
        if circle.hmmm:
            self.add_class("has-hmmm")
        self.id = f"circle-{circle.seed}-{circle.name}"


class SeedPane(Container):
    """A pane displaying all circles for a seed."""

    DEFAULT_CSS = """
    SeedPane {
        layout: horizontal;
        padding: 1 2;
        height: auto;
    }
    """

    def __init__(self, seed: Seed) -> None:
        self._seed = seed
        super().__init__()

    def compose(self) -> ComposeResult:
        for circle in self._seed.circles:
            yield CircleWidget(circle)


class HmmmBar(Static):
    """Header status bar showing the global hmmm register."""

    DEFAULT_CSS = """
    HmmmBar {
        dock: top;
        height: 1;
        background: $surface;
        color: $text-muted;
        padding: 0 2;
        text-align: right;
    }
    """

    hmmm: reactive[List[str]] = reactive(list)

    def render(self) -> str:
        if self.hmmm:
            return f"hmmm:{self.hmmm}"
        return "hmmm:[]"


class A0App(App):
    """The Guardian TUI — seeds as tabs, circles as widgets.

    Entrypoint: `python -m a0.guardian.ui.app`
    """

    TITLE = "a0"
    SUB_TITLE = "PTCA v1.3.2"

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("ctrl+c", "quit", "Quit"),
    ]

    CSS = """
    Screen {
        background: $surface;
    }
    TabbedContent {
        height: 1fr;
    }
    TabPane {
        padding: 1;
    }
    """

    def __init__(self, layout: SeedLayout | None = None) -> None:
        super().__init__()
        self._layout = layout or default_layout()

    def compose(self) -> ComposeResult:
        yield HmmmBar()
        yield Header()
        with TabbedContent():
            for seed in self._layout.seeds:
                with TabPane(seed.label, id=f"seed-{seed.name}"):
                    yield SeedPane(seed)
        yield Footer()

    def set_hmmm(self, entries: List[str]) -> None:
        """Update the global hmmm register display."""
        bar = self.query_one(HmmmBar)
        bar.hmmm = entries


def main() -> None:
    """Launch the Guardian TUI."""
    app = A0App()
    app.run()


if __name__ == "__main__":
    main()
# 58:74
