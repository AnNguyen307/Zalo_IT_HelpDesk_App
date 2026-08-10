# Warm Industrial + Signal System

Design source of truth for Zalo IT HelpDesk v5.14.0.

## Product principles

1. Every important surface shows current state, owner, next step and who must act.
2. Playbook is authoritative evidence; AI is an inspectable advisory layer for HelpDesk.
3. Employee surfaces never expose provider, model, confidence or retrieval scores.
4. Technical does not mean cyberpunk. Warm service-sheet structure replaces decorative dashboard chrome.
5. Status is always expressed with text or icons in addition to color.

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

## AI disclosure boundary

Employee UI may show `Trợ lý thông minh` and `Đã đối chiếu quy trình được phê duyệt`. Provider, model, confidence, Playbook retrieval scores and internal reasoning remain Staff-only. HelpDesk can inspect AI outcome, evidence, risk, Playbook fit, hypotheses and safe stop conditions.
