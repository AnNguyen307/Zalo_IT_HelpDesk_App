# Warm Industrial + Signal System

Design source of truth được giới thiệu ở v5.14.0 và tiếp tục áp dụng cho Backend/Admin `v5.18.6` cùng Mini App source `v5.17.2`.

## Product principles

1. Every important surface shows current state, owner, next step and who must act.
2. Playbook is authoritative evidence; AI is an inspectable advisory layer for HelpDesk.
3. Employee surfaces never expose provider, model, confidence or retrieval scores.
4. Technical does not mean cyberpunk. Warm service-sheet structure replaces decorative dashboard chrome.
5. Status is always expressed with text or icons in addition to color.
6. Copy is concise and functional; avoid promotional slogans in operational screens.
7. Focus must be visible without nested outlines, layout shifts or excessive signal-blue frames.

## Core tokens

| Token | Value | Use |
|---|---:|---|
| Warm Ivory | `#F7F5F0` | Application canvas |
| Soft Sand | `#EEE8DE` | Technical headers and grouped surfaces |
| Surface | `#FBFAF7` | Primary panels |
| Graphite | `#202124` | Navigation and primary text |
| Muted Slate | `#667085` | Secondary text |
| Border | `#D9D4CB` | Panel and row rules |
| Signal Blue | `#1769FF` | Current state and primary action |
| Deep Blue | `#0D47C9` | Links and active labels |
| Safety Orange | `#FF8A3D` | User attention required |
| Signal Amber | `#D7A128` | Waiting and warning |
| Soft Green | `#48A868` | Completed and healthy |
| Alert Red | `#D64545` | Critical and overdue only |

Radii use 4/6/8/10px for operational UI. Shadows are restrained; borders and spacing establish hierarchy.

## Signal patterns

- Ticket cards: status, owner, next step, action signal and a four-stage tracker.
- Admin queue: SLA signal, recommendation, action owner and next action are visible before opening a ticket.
- Ticket Workspace: queue, conversation and context remain visible as three coordinated zones on wide screens.
- Mobile Ticket Detail: a signal board precedes the conversation and uses the same four-stage vocabulary.
- Human handoff is shown as progress with owner and expected SLA, never as AI failure.

## Responsive behavior

- Mini App is touch-first with 44px minimum controls and a four-item bottom navigation.
- Admin uses three Ticket Workspace zones above 1260px, two zones on compact laptops and one column on narrow screens.
- Operational tables retain horizontal scrolling; navigation becomes non-fixed on narrow screens.
- Focus rings, reduced-motion support and text labels accompany all signals.
- Account menus and dialogs must render above animated/sticky workspaces at every breakpoint.
- Login and critical forms keep labels visible, errors next to the affected field and a single clear primary action.

## Accessibility and interaction

- Keyboard focus follows reading order and never becomes trapped behind overlays.
- Icon-only actions require accessible names and an equivalent text cue where ambiguity remains.
- Error, warning and success states combine color with icon/text.
- Text and interactive controls maintain usable contrast on Warm Ivory and dark Graphite surfaces.
- Loading actions disable duplicate submission and explain what is happening.
- Reduced-motion users receive the same information without relying on animation.

## Review checklist

- Desktop: 1366px and 1920px wide.
- Mobile: 360px, 390px and 430px wide, including safe-area bottom inset.
- Long Vietnamese labels, empty states, validation errors and network failures.
- Open Account menu on Overview, Playbook and System & AI.
- Login with empty, wrong and valid credentials; show/hide password; keyboard-only submission.

## AI disclosure boundary

Employee UI may show `Trợ lý thông minh` and `Đã đối chiếu quy trình được phê duyệt`. Provider, model, confidence, Playbook retrieval scores and internal reasoning remain Staff-only. HelpDesk can inspect AI outcome, evidence, risk, Playbook fit, hypotheses and safe stop conditions.
