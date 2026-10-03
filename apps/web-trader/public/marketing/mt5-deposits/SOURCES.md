# MT5 deposit feature references

Verified on 1 October 2026.

## Screenshots

These user-supplied images were inspected and copied without modification. They are MetaTrader 5 / ECOMMPAY examples supplied with the product brief, not screenshots of a live Azuriya payment integration. Names, balances, commissions and configuration settings are example data.

| Public file                  | Dimensions  | Caption                                                                          | User attachment                                            |
| ---------------------------- | ----------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `desktop-deposit.png`        | 1802 × 896  | Deposit amount, payment method and commission shown in the MT5 desktop terminal. | `codex-clipboard-66af83ca-9bbf-474d-9989-fae77f58e296.png` |
| `desktop-mobile-deposit.png` | 1854 × 952  | MT5 desktop and mobile deposit examples using the same payment workflow.         | `codex-clipboard-a6457dd3-ad05-46b0-8741-9cb7cc3aa8c6.png` |
| `wallet-currencies.png`      | 942 × 776   | Broker configuration for accepted currencies and deposit / withdrawal limits.    | `codex-clipboard-04efcf96-ff4c-4610-86e2-ae50e51379c9.png` |
| `wallet-commissions.png`     | 1064 × 770  | Broker configuration for tiered payment commissions.                             | `codex-clipboard-656c2bf9-7a9b-47c9-be43-95cef87ddd16.png` |
| `deposit-rules.png`          | 1818 × 1188 | Broker configuration for manual and automatic deposit checks.                    | `codex-clipboard-01bc477b-39f9-42d7-bda4-e7f51e693473.png` |

The original attachments are under `C:/Users/Azaru/AppData/Local/Temp/`. The screenshot containing payment gateway authorization credentials was not copied into public assets.

## Primary references

- [MetaTrader 5 built-in payments](https://www.metatrader5.com/en/brokers/payments): native funding can be initiated through the trading platform; MetaQuotes describes the built-in service as free.
- [Desktop deposits and withdrawals](https://www.metatrader5.com/en/terminal/help/startworking/payments): the broker determines availability, methods and providers. The payment provider handles secure payment details. After completion and broker approval, the trading account is credited and its history records the balance operation.
- [iPhone deposits and withdrawals](https://www.metatrader5.com/en/mobile-trading/iphone/help/settings_accounts/payments): Settings → Deposit provides native funding and transaction history when enabled by the broker.
- [Android deposits and withdrawals](https://www.metatrader5.com/en/mobile-trading/android/help/settings_accounts/payments): Accounts → Deposit provides the native payment workflow when enabled by the broker.
- [ECOMMPAY joins MetaTrader 5 Payments](https://www.metatrader5.com/en/news/2321): official MetaQuotes provider announcement, dated 20 October 2023. A broker needs an agreement with the payment provider and platform configuration.
- [Unlimit operates built-in MT5 payments](https://www.metatrader5.com/en/news/2340): official MetaQuotes provider announcement, dated 10 January 2024.
- [APS MetaTrader 5 Embedded Payments](https://aps.money/online-payments/metatrader-5-embedded-payments/): current provider product page for licensed brokerages.
- [MetaQuotes payment-method expansion](https://www.metatrader5.com/en/news/2364): dated 17 September 2024; records the introduction of more than 40 regional methods. This is a historical platform announcement, not a promise that all methods are enabled for every brokerage today.

## Copy scope

Native payments depend on the brokerage's MT5 configuration and its payment-provider approval. Available currencies, countries, payment methods, fees, limits and processing time depend on that setup. Card details are submitted to the payment provider. Provider transaction fees can apply even when the native platform integration is free.

The dedicated page presents this feature and its configuration options. It does not execute payments, collect card details or imply that a live payment gateway is connected to the local Azuriya demo.

The pasted ECOMMPAY setup article, dated 6 April 2024, is a user-supplied reference. Its six-provider list is not used as an exhaustive current list. No gateway credentials, callback allowlists or server secrets from the article or screenshots are copied into page code.
