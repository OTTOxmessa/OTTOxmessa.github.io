## The problem

Multi-step work — group projects or your own — gets lost in a plain list. Kanban boards help, but most are **drag-only**, so keyboard and screen-reader users can't move cards at all.

## What it does

- Multiple boards; add, delete and reorder columns; set a **WIP limit** that warns when a column is overloaded
- Cards with notes, coloured labels, due dates (overdue / today / soon) and checklists with a progress bar
- **Drag and drop** between columns with a drop-position indicator
- **Keyboard moves** — focus a card and press `Alt` + arrows; the new position is announced ("Moved to Doing, position 1 of 3")
- Search, filter by label or due date, and a table view sorted by due date
- Export a board as JSON for a teammate to import (the file is validated first)

## Details I cared about

- Immutable logic: every function returns a new board, which keeps it testable and free of shared-mutation bugs
- Dragging always has **a non-drag alternative** (keyboard, or the column picker in card details), per WCAG 2.2 SC 2.5.7 Dragging Movements
