

Powerpool Protocol
=================

The PowerPool is a cross-chain lending protocol for the governance tokens, such as COMP, BAL, LEND, YFI, BZRX, AKRO, and many others. It is important to note that currently, PowerPool is targeted on the Defi market as the hottest one, but generally is not limited to it and can serve for pooling any other governance tokens in the Ethereum ecosystem.
The PowerPool is based on a simple lending model, close to Compound’s one from the first sight. Every holder of governance tokens can supply liquidity into a contract and get the interest rate if there is a demand. Any person on the market can borrow governance tokens placing allowed digital assets as collateral. Currently, we plan to add ETH, wBTC, and DAI as collaterals for borrowing governance tokens. On the other hand, it has certain upgrades, and the particular set of oracles developed to form price feeds of highly-volatile assets such as governance tokens.
Talking about the economic nature of governance tokens, they are unique assets in the context of lending/borrowing mechanics. The utility of governance tokens is not constant in time (comparing, for example, with payment tokens such as stablecoins). Talking strictly, it appears only during voting. Our vision is to introduce a novel type of lending logic, which is not available by default in Compound or any other lending protocols but can be very suitable for governance tokens. 

Contracts
=========

We detail a few of the core contracts in the Powerpool protocol.

<dl>
  <dt>ppToken, ppErc20 and ppEther</dt>
  <dd>The PowerPool ppTokens, which are self-contained borrowing and lending contracts. ppToken contains the core logic and ppErc20 and ppEther add public interfaces for Erc20 tokens and ether, respectively. Each ppToken is assigned an interest rate and risk model (see InterestRateModel and Comptroller sections), and allows accounts to *mint* (supply capital), *redeem* (withdraw capital), *borrow* and *repay a borrow*. Each ppToken is an ERC-20 compliant token where balances represent ownership of the market.</dd>
</dl>

<dl>
  <dt>Comptroller</dt>
  <dd>The risk model contract, which validates permissible user actions and disallows actions if they do not fit certain risk parameters. For instance, the Comptroller enforces that each borrowing user must maintain a sufficient collateral balance across all cTokens.</dd>
</dl>

<dl>
  <dt>CVP</dt>
  <dd>The Concentrated Voting Power Token (CVP). Holders of this token have the ability to govern the protocol via the governor contract.</dd>
</dl>

<dl>
  <dt>Governor Alpha</dt>
  <dd>The administrator of the Compound timelock contract. Holders of Comp token may create and vote on proposals which will be queued into the Compound timelock and then have effects on Compound cToken and Comptroller contracts. This contract may be replaced in the future with a beta version.</dd>
</dl>

<dl>
  <dt>InterestRateModel</dt>
  <dd>Contracts which define interest rate models. These models algorithmically determine interest rates based on the current utilization of a given market (that is, how much of the supplied assets are liquid versus borrowed).</dd>
</dl>

<dl>
  <dt>Careful Math</dt>
  <dd>Library for safe math operations.</dd>
</dl>

<dl>
  <dt>ErrorReporter</dt>
  <dd>Library for tracking error codes and failure conditions.</dd>
</dl>

<dl>
  <dt>Exponential</dt>
  <dd>Library for handling fixed-point decimal numbers.</dd>
</dl>

<dl>
  <dt>SafeToken</dt>
  <dd>Library for safely handling Erc20 interaction.</dd>
</dl>

<dl>
  <dt>WhitePaperInterestRateModel</dt>
  <dd>Initial interest rate model, as defined in the CCompound Whitepaper. This contract accepts a base rate and slope parameter in its constructor.</dd>
</dl>

Installation
------------
To run Powerpool, pull the repository from GitHub and install its dependencies. You will need [yarn](https://yarnpkg.com/lang/en/docs/install/) or [npm](https://docs.npmjs.com/cli/install) installed.

    git clone https://github.com/powerpool-finance/powerpool-protocol.git
    cd powerpool-protocol
    yarn install --lock-file # or `npm install`



