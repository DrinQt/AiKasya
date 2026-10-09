# AIKasya — Live Demo & Presentation Script

> **AppBuildersPH Hackathon 2026** | **Theme: Local AI**  
> *"Kasya sa budget. Swak sa hapag!"*

---

## Part 1: 60-Second Video / Quick Demo Flow

| Timing | Speaker / Visual Action | What the Audience Sees |
|---|---|---|
| **00:00 – 00:08** | **The Hook & Problem:** *"Most recipe apps ask 'What do you want to cook?' but Filipino families ask 'How much money do we have today?'"* | Title screen: AIKasya. Hero input showing: *"May ₱200 ako pang-ulam ng apat. May kanin at bawang na kami."* |
| **00:08 – 00:18** | **Offline Proof:** Physically toggle off Wi-Fi / Airplane mode. *"Notice Wi-Fi is completely OFF. No internet, no cloud LLM API, zero data cost."* | Network tray showing disconnected. Health status pill: `● Local AI Ready (Qwen 2.5 1.5B) - 100% Offline`. |
| **00:18 – 00:30** | **On-Device Interpretation:** Submit query. *"Our local language model extracts ₱200 budget, 4 servings, and credits on-hand rice and garlic, passing it to our deterministic optimizer."* | AI chat card displaying extracted tags: `Budget: ₱200`, `Servings: 4`, `Pantry: Rice, Garlic`. 2 feasible meals appear (e.g. *Ginisang Monggo* at ₱75.00, *Tortang Talong* at ₱76.00). |
| **00:30 – 00:42** | **Shopping List Generation:** Click *Tortang Talong*. *"AIKasya creates an exact palengke shopping list. It doesn't charge for rice or garlic because we already have them."* | Breakdown showing items to buy: Eggplants (4 pcs = ₱40.00), Eggs (4 pcs = ₱36.00). Total: ₱76.00. Remaining: ₱124.00. |
| **00:42 – 00:54** | **Market Mode Repricing:** Change vendor price in real-time. *"You arrive at the palengke and eggs are now ₱10 each instead of ₱9. Update it right on your phone/laptop—it instantly re-optimizes without cloud."* | Total dynamically updates to ₱80.00; remaining budget updates to ₱120.00. |
| **00:54 – 01:00** | **Closing:** *"Real arithmetic. Real palengke prices. Real on-device AI that works even when the cloud disappears."* | Final screen showing tagline: *AIKasya — Kasya sa budget. Swak sa hapag!* |

---

## Part 2: 5-Minute Finalist Pitch Structure

1. **The Problem (0:00 - 0:40):**
   - High food inflation and variable daily cash flow for Filipino households.
   - Poor/expensive mobile reception inside wet markets (*palengke*).
   - Recipe apps suggest impractical dishes without respecting actual grocery prices.
2. **Our Solution (0:40 - 1:20):**
   - AIKasya flips the model: Budget-first, pantry-aware, and palengke-priced.
   - A true on-device local agent paired with deterministic optimization.
3. **LIVE OFFLINE DEMO (1:20 - 3:20):**
   - Airplane mode enabled live on stage.
   - Fresh Taglish query typed in front of judges.
   - Local LLM extracts constraints $\rightarrow$ SQLite + Python optimizer ranks dishes.
   - Live price change and instant re-calculation.
4. **Architecture & Engineering Integrity (3:20 - 4:20):**
   - Local Qwen2.5 1.5B via Ollama.
   - Separation of concerns: LLM handles linguistics/intent; Python/Decimal handles money and math. No hallucinations.
5. **Impact & Future Roadmap (4:20 - 5:00):**
   - Multi-day shopping trip aggregation, SMS/offline mesh sync, local community price sharing.
