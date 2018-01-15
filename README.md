`PresalePool` is a smart contract for pooling together contributions to invest in an ICO.

It supports the following configuration options:

* minimum contribution threshold applied to each contributor
* maximum contribution limit applied to each contributor
* cap on total contributions from the pool
* whitelist of addresses which are allowed to contribute to the pool

Once deployed, the `PresalePool` contract can be in one of four states: `Open`, `Failed`, `Refund`, or `Paid`

In the `Open` state contributors are able to deposit funds to the pool or withdraw funds from their contributions.

In the `Failed` or `Refund` state contributors can only withdraw their funds from the pool.

In the `Paid` state contributors can withdraw funds which were not included in the pool's overall contribution to the ICO.
After the contract creator sets token contract on `PresalePool`, contributors will able to obtain their tokens.
There is also a method for delivering the tokens to all the pool's contributors which can be invoked by the the contract creator.

The operation to transition to a `Paid` state is `O(1)`. Similarly, the contributor operations (deposit eth, withdraw eth, obtain tokens) are `O(1)`. The operation to deliver tokens to all the pool's contributors is `O(n)` where `n` is the number of contributors. This operation is likely to fail for pools consisting of many contributors because of gas limits.

In some cases editing the contribution limits can be an `O(n)` operation. Adding or removing a whitelist is an `O(n)` operation. Modifying an existing whitelist is an `O(w)` operation where `w` is the sum of additions and deletions on the whitelist.

Development
===========

Requirements
------------

* `node 8.x`

Running tests
-------------

`npm run test`
`npm run test-only "matches test string"`

LICENSE
===========

As per GitHub Terms of Service, we allow others to view and fork the repository, but we do not offer any license.

### What does it mean? 
As stated by GitHub: 
> If you find software that doesn’t have a license, that generally means you have no permission from the creators of the software to use, modify, or share the software. Although a code host such as GitHub may allow you to view and fork the code, this does not imply that you are permitted to use, modify, or share the software for any purpose.

Source: https://choosealicense.com/no-permission/
