const {makeCToken} = require('../Utils/Compound');
const {
  encodeParameters,
  advanceBlocks,
} = require('../Utils/Ethereum');

const BigNum = require('bignumber.js');

BigNum.config({EXPONENTIAL_AT: 30})

function ether(value) {
  const v = new BigNum(value);
  return v.multipliedBy('1e18').toString();
}

describe('PPGtDelegate Token', function () {
  const data = encodeParameters(['uint256'], [42]);

  let root, accounts;
  let alice, bob, charlie, treasury, voteCaster;
  let ppUni, counter, proposeArgs;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    [alice, bob, charlie, treasury, voteCaster] = accounts;

    ppUni = await makeCToken({
      kind: 'ppgt',
      admin: bob,
      symbol: "ppUNI",
      cvpOpts: {cvpBeneficiary: treasury},
      governorOpts: {cvpBeneficiary: alice},
      voteCaster: {_address: voteCaster}
    });
    counter = await deploy('Counter');
    proposeArgs = [[counter._address], [0], ['increment(uint256)'], [data], "let's do it"];
  });

  describe('initialization', () => {
    it('should correctly assign the initial variables', async () => {
      const {governor} = ppUni;
      expect(await call(ppUni, 'governorAlpha', [])).toEqual(governor._address);
      expect(await call(ppUni, 'voteCaster', [])).toEqual(voteCaster);
      expect(await call(ppUni, 'admin', [])).toEqual(bob);
    });
  });

  describe('admin interface', () => {
    it('should allow admin setting governorAlpha address', async () => {
      await send(ppUni, 'setGovernorAlpha', [charlie], {from: bob});
      expect(await call(ppUni, 'governorAlpha', [])).toEqual(charlie);
    });

    it('should allow admin setting voteCaster address', async () => {
      await send(ppUni, 'setVoteCaster', [charlie], {from: bob});
      expect(await call(ppUni, 'voteCaster', [])).toEqual(charlie);
    });

    it('should deny non-admin setting governorAlpha address', async () => {
      await expect(send(ppUni, 'setGovernorAlpha', [charlie], {from: alice}))
        .rejects.toRevert("revert PPGT:setGovernorAlpha: Only admin allowed");
    })

    it('should deny non-admin setting voteCaster address', async () => {
      await expect(send(ppUni, 'setVoteCaster', [charlie], {from: alice}))
        .rejects.toRevert("revert PPGT:setVoteCaster: Only admin allowed");
    })
  });

  it('should allow a vote caster creating a proposal in the governor contract and voting for it', async () => {
    const {governor: uniGovernor} = ppUni;
    const {underlying: uni} = ppUni;

    // prepare
    await send(uni, 'transfer', [ppUni._address, ether(400 * 1000)], {from: treasury});

    await advanceBlocks(2);

    await send(ppUni, 'selfDelegate', {from: alice});

    // propose
    await send(ppUni, 'propose', proposeArgs, {from: voteCaster});

    let proposal = await call(uniGovernor, 'proposals', [1])
    expect(proposal.proposer).toEqual(ppUni._address);

    const actions = await call(uniGovernor, 'getActions', [1])

    expect(actions.targets).toEqual([counter._address]);
    expect(actions.signatures).toEqual(['increment(uint256)']);
    expect(actions.calldatas).toEqual([data]);

    // vote for
    await advanceBlocks(2);
    await send(ppUni, 'castVote', [1, true], {from: voteCaster});

    proposal = await call(uniGovernor, 'proposals', [1])
    expect(proposal.proposer).toEqual(ppUni._address);
    expect(proposal.forVotes).toEqual(ether(400 * 1000));
  });

  it('should deny non-voteCaster creating a proposal', async () => {
    await expect(send(ppUni, "propose", proposeArgs, {from: alice}))
      .rejects.toRevert("revert PPGT:castVote: Only voteCaster allowed");
  })
});