`PresalePool` is a smart contract for pooling together contributions to invest in an ICO.

It supports the following configuration options:

* minimum contribution threshold applied to each contributor
* maximum contribution limit applied to each contributor
* cap on total contributions from the pool
* whitelist of addresses which are allowed to contribute to the pool

Once deployed, the `PresalePool` contract can be in one of four states: `Open`, `Closed`, `Failed`, or `Paid`

In the `Open` state contributors are able to deposit funds to the pool or withdraw funds from their contributions.

In the `Closed` state contributors can neither deposit nor withdraw funds.

In the `Failed` state contributors can only withdraw their funds from the pool.

In the `Paid` state contributors can withdraw funds which were not included in the pool's overall contribution to the ICO.
After the contract creator sets token contract on `PresalePool`, contributors are also able to obtain their tokens.
There is also a method for delivering the tokens to all the pool's contributors which can be invoked by the the contract creator.