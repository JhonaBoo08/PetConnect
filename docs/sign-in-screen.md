# Pet-Connect Sign-In Screen — UI/UX Spec

Destination screen reached after tapping **Get Started** on the Pet-Connect welcome screen.

## Purpose
Pet-Connect is a community pet identity, health, safety, and lost-pet reunion platform for Tagum City. This screen lets a user choose an account type and sign in.

## Visual Language
Keep the welcome screen's identity exactly:

- Portrait mobile layout, ~390 × 844 px.
- Warm cream background `#F8F0DF`.
- Thin muted sage-green border around the screen.
- Rounded outer corners, 25–30 px.
- Brand palette only:
  - Forest green (primary): `#1B4332` (spec alt: `#005526`)
  - Muted sage (inactive controls): `#DCE7DA` (spec alt: `#A8B99F`)
  - Warm off-white surface: `#FFFDF7`
  - Muted ink: `#5C6356`
- Minimal shadows, generous whitespace.
- Clean, caring, trustworthy — not a playful game. No heavy gradients or decorative art.

## Header
- Top-left back arrow with comfortable edge padding.
- Compact brand row:
  - Small circular badge with the simplified dog-and-cat mark.
  - Right of the badge: **Pet-Connect** (bold, forest green).
  - Under it, uppercase tagline: **SCAN · PROTECT · RECONNECT** (small sans, letter-spaced).

## Welcome Section
- **Welcome back** — large bold forest-green heading (28–30 px).
- **Care follows wherever your pet goes.** — smaller muted subtitle.
- Calm, uncluttered spacing.

## Account Type Selector
- Full-width pill segmented control, ~40 px tall, on a light beige/sage track.
- Two options: **Pet Owner** | **Vet Clinic**, each with a simple line icon.
- **Pet Owner** selected by default: forest-green fill, white text.
- Unselected option: soft beige/sage background, dark text.
- Switching updates the authentication context without changing the layout.

## Login Form
- **Email address** label above an input with placeholder `you@example.com`.
- **Password** label above an input with placeholder `At least 6 characters`.
- Inputs: 44–48 px tall, warm off-white background, subtle green-gray border, ~14 px radius, dark text, consistent vertical spacing.

## Primary Login Button
- Full-width pill **Sign In**.
- Forest-green background, white bold/medium text, ~46 px tall, 20–24 px radius, subtle shadow.
- Strongest call-to-action on the screen.

## Alternative Login
- Full-width secondary **Continue with Google**.
- Warm cream/off-white background, thin muted green-gray border, dark text, small Google icon.
- Same height/radius as Sign In.

## Registration
- Centered text: **New here? Create an account**.
- **Create an account** emphasized in forest green as the tappable action.

## Demo Option
- Small secondary line near the bottom: **Explore the UI with demo data** (muted, clearly secondary).

## UX Behavior
- Get Started → Pet Owner Sign In (default account type = Pet Owner).
- Vet Clinic switches the auth context, same layout.
- Create an account → registration.
- Continue with Google → alternative auth method.
- Explore the UI with demo data → preview without an account.

## Typography
Modern sans-serif (Inter, Poppins, or SF Pro), matching the welcome screen's display font.

| Element          | Size    | Weight |
| ---------------- | ------- | ------ |
| Welcome back     | 28–30px | Bold   |
| Pet-Connect      | 18–20px | Bold   |
| Form labels      | 14px    | Medium/Bold |
| Input text       | 14–16px | Regular |
| Buttons          | 14–16px | Medium |
| Supporting text  | 12–14px | Regular |

## UX Principles
- Authentication immediately understandable.
- Pet Owner and Vet Clinic clearly separated.
- Sign In is primary; Google is secondary.
- Account creation easy to discover.
- Strong contrast, readable type, comfortable tap targets.
- Preserve generous whitespace and consistency with the welcome screen.
- Do not introduce colors that conflict with the cream + forest-green palette.

## Overall Direction
A warm, minimal, trustworthy pet-care app suitable for a real community service — communicating care, safety, identity, and reconnection while staying simple for first-time users.
