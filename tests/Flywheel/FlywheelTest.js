const {
  makeComptroller,
  makeCToken,
  balanceOf,
  fastForward,
  pretendBorrow,
  quickMint
} = require('../Utils/Compound');
const {
  etherExp,
  etherDouble,
  etherUnsigned,
  etherMantissa
} = require('../Utils/Ethereum');

const cvpRate = etherUnsigned(1e18);

async function cvpAccrued(comptroller, user) {
  return etherUnsigned(await call(comptroller, 'cvpAccrued', [user]));
}

async function cvpBalance(comptroller, user) {
  return etherUnsigned(await call(comptroller.cvp, 'balanceOf', [user]))
}

async function totalCvpAccrued(comptroller, user) {
  return (await cvpAccrued(comptroller, user)).add(await cvpBalance(comptroller, user));
}

describe('Flywheel upgrade', () => {
  describe('becomes the comptroller', () => {
    it('adds the cvp markets', async () => {
      let root = saddle.accounts[0];
      let unitroller = await makeComptroller({kind: 'unitroller-g2'});
      let cvpMarkets = await Promise.all([1, 2, 3].map(async _ => {
        return makeCToken({comptroller: unitroller, supportMarket: true});
      }));
      cvpMarkets = cvpMarkets.map(c => c._address);
      unitroller = await makeComptroller({kind: 'unitroller-g3', unitroller, cvpMarkets});
      expect(await call(unitroller, 'getCvpMarkets')).toEqual(cvpMarkets);
    });

    it('adds the other markets', async () => {
      let root = saddle.accounts[0];
      let unitroller = await makeComptroller({kind: 'unitroller-g2'});
      let allMarkets = await Promise.all([1, 2, 3].map(async _ => {
        return makeCToken({comptroller: unitroller, supportMarket: true});
      }));
      allMarkets = allMarkets.map(c => c._address);
      unitroller = await makeComptroller({
        kind: 'unitroller-g3',
        unitroller,
        cvpMarkets: allMarkets.slice(0, 1),
        otherMarkets: allMarkets.slice(1)
      });
      expect(await call(unitroller, 'getAllMarkets')).toEqual(allMarkets);
      expect(await call(unitroller, 'getCvpMarkets')).toEqual(allMarkets.slice(0, 1));
    });

    it('_supportMarket() adds to all markets, and only once', async () => {
      let root = saddle.accounts[0];
      let unitroller = await makeComptroller({kind: 'unitroller-g3'});
      let allMarkets = [];
      for (let _ of Array(10)) {
        allMarkets.push(await makeCToken({comptroller: unitroller, supportMarket: true}));
      }
      expect(await call(unitroller, 'getAllMarkets')).toEqual(allMarkets.map(c => c._address));
      expect(
        makeComptroller({
          kind: 'unitroller-g3',
          unitroller,
          otherMarkets: [allMarkets[0]._address]
        })
      ).rejects.toRevert('revert market already added');
    });
  });
});

describe('Flywheel', () => {
  let root, a1, a2, a3, accounts;
  let comptroller, cLOW, cREP, cZRX, cEVIL;
  beforeEach(async () => {
    let interestRateModelOpts = {borrowRate: 0.000001};
    [root, a1, a2, a3, ...accounts] = saddle.accounts;
    comptroller = await makeComptroller();
    cLOW = await makeCToken({comptroller, supportMarket: true, underlyingPrice: 1, interestRateModelOpts});
    cREP = await makeCToken({comptroller, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
    cZRX = await makeCToken({comptroller, supportMarket: true, underlyingPrice: 3, interestRateModelOpts});
    cEVIL = await makeCToken({comptroller, supportMarket: false, underlyingPrice: 3, interestRateModelOpts});
    await send(comptroller, '_addCvpMarkets', [[cLOW, cREP, cZRX].map(c => c._address)]);
  });

  describe('getCvpMarkets()', () => {
    it('should return the cvp markets', async () => {
      expect(await call(comptroller, 'getCvpMarkets')).toEqual(
        [cLOW, cREP, cZRX].map((c) => c._address)
      );
    });
  });

  describe('updateCvpBorrowIndex()', () => {
    it('should calculate cvp borrower index correctly', async () => {
      const mkt = cREP;
      await send(comptroller, 'setBlockNumber', [100]);
      await send(mkt, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
      await send(comptroller, 'setCvpSpeed', [mkt._address, etherExp(0.5)]);
      await send(comptroller, 'harnessUpdateCvpBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);
      /*
        100 blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed

        borrowAmt   = totalBorrows * 1e18 / borrowIdx
                    = 11e18 * 1e18 / 1.1e18 = 10e18
        cvpAccrued = deltaBlocks * borrowSpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += 1e36 + cvpAccrued * 1e36 / borrowAmt
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */

      const {index, block} = await call(comptroller, 'cvpBorrowState', [mkt._address]);
      expect(index).toEqualNumber(6e36);
      expect(block).toEqualNumber(100);
    });

    it('should not revert or update cvpBorrowState index if cToken not in CVP markets', async () => {
      const mkt = await makeCToken({
        comptroller: comptroller,
        supportMarket: true,
        addCvpMarket: false,
      });
      await send(comptroller, 'setBlockNumber', [100]);
      await send(comptroller, 'harnessUpdateCvpBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);

      const {index, block} = await call(comptroller, 'cvpBorrowState', [mkt._address]);
      expect(index).toEqualNumber(0);
      expect(block).toEqualNumber(100);
      const speed = await call(comptroller, 'cvpSpeeds', [mkt._address]);
      expect(speed).toEqualNumber(0);
    });

    it('should not update index if no blocks passed since last accrual', async () => {
      const mkt = cREP;
      await send(comptroller, 'setCvpSpeed', [mkt._address, etherExp(0.5)]);
      await send(comptroller, 'harnessUpdateCvpBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);

      const {index, block} = await call(comptroller, 'cvpBorrowState', [mkt._address]);
      expect(index).toEqualNumber(1e36);
      expect(block).toEqualNumber(0);
    });

    it('should not update index if cvp speed is 0', async () => {
      const mkt = cREP;
      await send(comptroller, 'setCvpSpeed', [mkt._address, etherExp(0)]);
      await send(comptroller, 'setBlockNumber', [100]);
      await send(comptroller, 'harnessUpdateCvpBorrowIndex', [
        mkt._address,
        etherExp(1.1),
      ]);

      const {index, block} = await call(comptroller, 'cvpBorrowState', [mkt._address]);
      expect(index).toEqualNumber(1e36);
      expect(block).toEqualNumber(100);
    });
  });

  describe('updateCvpSupplyIndex()', () => {
    it('should calculate cvp supplier index correctly', async () => {
      const mkt = cREP;
      await send(comptroller, 'setBlockNumber', [100]);
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      await send(comptroller, 'setCvpSpeed', [mkt._address, etherExp(0.5)]);
      await send(comptroller, 'harnessUpdateCvpSupplyIndex', [mkt._address]);
      /*
        suppyTokens = 10e18
        cvpAccrued = deltaBlocks * supplySpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += cvpAccrued * 1e36 / supplyTokens
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */
      const {index, block} = await call(comptroller, 'cvpSupplyState', [mkt._address]);
      expect(index).toEqualNumber(6e36);
      expect(block).toEqualNumber(100);
    });

    it('should not update index on non-CVP markets', async () => {
      const mkt = await makeCToken({
        comptroller: comptroller,
        supportMarket: true,
        addCvpMarket: false
      });
      await send(comptroller, 'setBlockNumber', [100]);
      await send(comptroller, 'harnessUpdateCvpSupplyIndex', [
        mkt._address
      ]);

      const {index, block} = await call(comptroller, 'cvpSupplyState', [mkt._address]);
      expect(index).toEqualNumber(0);
      expect(block).toEqualNumber(100);
      const speed = await call(comptroller, 'cvpSpeeds', [mkt._address]);
      expect(speed).toEqualNumber(0);
      // ctoken could have no cvp speed or cvp supplier state if not in cvp markets
      // this logic could also possibly be implemented in the allowed hook
    });

    it('should not update index if no blocks passed since last accrual', async () => {
      const mkt = cREP;
      await send(comptroller, 'setBlockNumber', [0]);
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      await send(comptroller, 'setCvpSpeed', [mkt._address, etherExp(0.5)]);
      await send(comptroller, 'harnessUpdateCvpSupplyIndex', [mkt._address]);

      const {index, block} = await call(comptroller, 'cvpSupplyState', [mkt._address]);
      expect(index).toEqualNumber(1e36);
      expect(block).toEqualNumber(0);
    });

    it('should not matter if the index is updated multiple times', async () => {
      const cvpRemaining = cvpRate.mul(100)
      await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      await send(comptroller, 'refreshCvpSpeeds');

      await quickMint(cLOW, a2, etherUnsigned(10e18));
      await quickMint(cLOW, a3, etherUnsigned(15e18));

      const a2Accrued0 = await totalCvpAccrued(comptroller, a2);
      const a3Accrued0 = await totalCvpAccrued(comptroller, a3);
      const a2Balance0 = await balanceOf(cLOW, a2);
      const a3Balance0 = await balanceOf(cLOW, a3);

      await fastForward(comptroller, 20);

      const txT1 = await send(cLOW, 'transfer', [a2, a3Balance0.sub(a2Balance0)], {from: a3});

      const a2Accrued1 = await totalCvpAccrued(comptroller, a2);
      const a3Accrued1 = await totalCvpAccrued(comptroller, a3);
      const a2Balance1 = await balanceOf(cLOW, a2);
      const a3Balance1 = await balanceOf(cLOW, a3);

      await fastForward(comptroller, 10);
      await send(comptroller, 'harnessUpdateCvpSupplyIndex', [cLOW._address]);
      await fastForward(comptroller, 10);

      const txT2 = await send(cLOW, 'transfer', [a3, a2Balance1.sub(a3Balance1)], {from: a2});

      const a2Accrued2 = await totalCvpAccrued(comptroller, a2);
      const a3Accrued2 = await totalCvpAccrued(comptroller, a3);

      expect(a2Accrued0).toEqualNumber(0);
      expect(a3Accrued0).toEqualNumber(0);
      expect(a2Accrued1).not.toEqualNumber(0);
      expect(a3Accrued1).not.toEqualNumber(0);
      expect(a2Accrued1).toEqualNumber(a3Accrued2.sub(a3Accrued1));
      expect(a3Accrued1).toEqualNumber(a2Accrued2.sub(a2Accrued1));

      expect(txT1.gasUsed).toBeLessThan(200000);
      expect(txT1.gasUsed).toBeGreaterThan(150000);
      expect(txT2.gasUsed).toBeLessThan(200000);
      expect(txT2.gasUsed).toBeGreaterThan(150000);
    });
  });

  describe('distributeBorrowerCvp()', () => {

    it('should update borrow index checkpoint but not cvpAccrued for first time user', async () => {
      const mkt = cREP;
      await send(comptroller, "setCvpBorrowState", [mkt._address, etherDouble(6), 10]);
      await send(comptroller, "setCvpBorrowerIndex", [mkt._address, root, etherUnsigned(0)]);

      await send(comptroller, "harnessDistributeBorrowerCvp", [mkt._address, root, etherExp(1.1)]);
      expect(await call(comptroller, "cvpAccrued", [root])).toEqualNumber(0);
      expect(await call(comptroller, "cvpBorrowerIndex", [ mkt._address, root])).toEqualNumber(6e36);
    });

    it('should transfer cvp and update borrow index checkpoint correctly for repeat time user', async () => {
      const mkt = cREP;
      await send(comptroller.cvp, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});
      await send(mkt, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
      await send(comptroller, "setCvpBorrowState", [mkt._address, etherDouble(6), 10]);
      await send(comptroller, "setCvpBorrowerIndex", [mkt._address, a1, etherDouble(1)]);

      /*
      * 100 delta blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed => 6e18 compBorrowIndex
      * this tests that an acct with half the total borrows over that time gets 25e18 CVP
        borrowerAmount = borrowBalance * 1e18 / borrow idx
                       = 5.5e18 * 1e18 / 1.1e18 = 5e18
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 6e36 - 1e36 = 5e36
        borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                       = 5e18 * 5e36 / 1e36 = 25e18
      */
      const tx = await send(comptroller, "harnessDistributeBorrowerCvp", [mkt._address, a1, etherUnsigned(1.1e18)]);
      expect(await cvpAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await cvpBalance(comptroller, a1)).toEqualNumber(25e18);
      expect(tx).toHaveLog('DistributedBorrowerCvp', {
        cToken: mkt._address,
        borrower: a1,
        cvpDelta: etherUnsigned(25e18).toString(),
        cvpBorrowIndex: etherDouble(6).toString()
      });
    });

    it('should not transfer if below cvp claim threshold', async () => {
      const mkt = cREP;
      await send(comptroller.cvp, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});
      await send(mkt, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e17), etherExp(1)]);
      await send(comptroller, "setCvpBorrowState", [mkt._address, etherDouble(1.0019), 10]);
      await send(comptroller, "setCvpBorrowerIndex", [mkt._address, a1, etherDouble(1)]);
      /*
        borrowerAmount = borrowBalance * 1e18 / borrow idx
                       = 5.5e17 * 1e18 / 1.1e18 = 5e17
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 1.0019e36 - 1e36 = 0.0019e36
        borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                       = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
        0.00095e18 < cvpClaimThreshold of 0.001e18
      */
      await send(comptroller, "harnessDistributeBorrowerCvp", [mkt._address, a1, etherExp(1.1)]);
      expect(await cvpAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
      expect(await cvpBalance(comptroller, a1)).toEqualNumber(0);
    });

    it('should not revert or distribute when called with non-CVP market', async () => {
      const mkt = await makeCToken({
        comptroller: comptroller,
        supportMarket: true,
        addCvpMarket: false,
      });

      await send(comptroller, "harnessDistributeBorrowerCvp", [mkt._address, a1, etherExp(1.1)]);
      expect(await cvpAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await cvpBalance(comptroller, a1)).toEqualNumber(0);
      expect(await call(comptroller, 'cvpBorrowerIndex', [mkt._address, a1])).toEqualNumber(0);
    });
  });

  describe('distributeSupplierCvp()', () => {
    it('should transfer cvp and update supply index correctly for first time user', async () => {
      const mkt = cREP;
      await send(comptroller.cvp, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
      await send(comptroller, "setCvpSupplyState", [mkt._address, etherDouble(6), 10]);
      /*
      * 100 delta blocks, 10e18 total supply, 0.5e18 supplySpeed => 6e18 cvpSupplyIndex
      * confirming an acct with half the total supply over that time gets 25e18 CVP:
        supplierAmount  = 5e18
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 6e36 - 1e36 = 5e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e18 * 5e36 / 1e36 = 25e18
      */

      const tx = await send(comptroller, "harnessDistributeSupplierCvp", [mkt._address, a1]);
      expect(await cvpAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await cvpBalance(comptroller, a1)).toEqualNumber(25e18);
      expect(tx).toHaveLog('DistributedSupplierCvp', {
        cToken: mkt._address,
        supplier: a1,
        cvpDelta: etherUnsigned(25e18).toString(),
        cvpSupplyIndex: etherDouble(6).toString()
      });
    });

    it('should update cvp accrued and supply index for repeat user', async () => {
      const mkt = cREP;
      await send(comptroller.cvp, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
      await send(comptroller, "setCvpSupplyState", [mkt._address, etherDouble(6), 10]);
      await send(comptroller, "setCvpSupplierIndex", [mkt._address, a1, etherDouble(2)])
      /*
        supplierAmount  = 5e18
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 6e36 - 2e36 = 4e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e18 * 4e36 / 1e36 = 20e18
      */

      await send(comptroller, "harnessDistributeSupplierCvp", [mkt._address, a1]);
      expect(await cvpAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await cvpBalance(comptroller, a1)).toEqualNumber(20e18);
    });

    it('should not transfer when cvpAccrued below threshold', async () => {
      const mkt = cREP;
      await send(comptroller.cvp, 'transfer', [comptroller._address, etherUnsigned(50e18)], {from: root});

      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e17)]);
      await send(comptroller, "setCvpSupplyState", [mkt._address, etherDouble(1.0019), 10]);
      /*
        supplierAmount  = 5e17
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 1.0019e36 - 1e36 = 0.0019e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
      */

      await send(comptroller, "harnessDistributeSupplierCvp", [mkt._address, a1]);
      expect(await cvpAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
      expect(await cvpBalance(comptroller, a1)).toEqualNumber(0);
    });

    it('should not revert or distribute when called with non-CVP market', async () => {
      const mkt = await makeCToken({
        comptroller: comptroller,
        supportMarket: true,
        addCvpMarket: false,
      });

      await send(comptroller, "harnessDistributeSupplierCvp", [mkt._address, a1]);
      expect(await cvpAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await cvpBalance(comptroller, a1)).toEqualNumber(0);
      expect(await call(comptroller, 'cvpBorrowerIndex', [mkt._address, a1])).toEqualNumber(0);
    });

  });

  describe('transferCvp', () => {
    it('should transfer cvp accrued when amount is above threshold', async () => {
      const cvpRemaining = 1000, a1AccruedPre = 100, threshold = 1;
      const cvpBalancePre = await cvpBalance(comptroller, a1);
      const tx0 = await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      const tx1 = await send(comptroller, 'setCvpAccrued', [a1, a1AccruedPre]);
      const tx2 = await send(comptroller, 'harnessTransferCvp', [a1, a1AccruedPre, threshold]);
      const a1AccruedPost = await cvpAccrued(comptroller, a1);
      const cvpBalancePost = await cvpBalance(comptroller, a1);
      expect(cvpBalancePre).toEqualNumber(0);
      expect(cvpBalancePost).toEqualNumber(a1AccruedPre);
    });

    it('should not transfer when cvp accrued is below threshold', async () => {
      const cvpRemaining = 1000, a1AccruedPre = 100, threshold = 101;
      const cvpBalancePre = await call(comptroller.cvp, 'balanceOf', [a1]);
      const tx0 = await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      const tx1 = await send(comptroller, 'setCvpAccrued', [a1, a1AccruedPre]);
      const tx2 = await send(comptroller, 'harnessTransferCvp', [a1, a1AccruedPre, threshold]);
      const a1AccruedPost = await cvpAccrued(comptroller, a1);
      const cvpBalancePost = await cvpBalance(comptroller, a1);
      expect(cvpBalancePre).toEqualNumber(0);
      expect(cvpBalancePost).toEqualNumber(0);
    });

    it('should not transfer cvp if cvp accrued is greater than cvp remaining', async () => {
      const cvpRemaining = 99, a1AccruedPre = 100, threshold = 1;
      const cvpBalancePre = await cvpBalance(comptroller, a1);
      const tx0 = await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      const tx1 = await send(comptroller, 'setCvpAccrued', [a1, a1AccruedPre]);
      const tx2 = await send(comptroller, 'harnessTransferCvp', [a1, a1AccruedPre, threshold]);
      const a1AccruedPost = await cvpAccrued(comptroller, a1);
      const cvpBalancePost = await cvpBalance(comptroller, a1);
      expect(cvpBalancePre).toEqualNumber(0);
      expect(cvpBalancePost).toEqualNumber(0);
    });
  });

  describe('claimCvp', () => {
    it('should accrue cvp and then transfer cvp accrued', async () => {
      const cvpRemaining = cvpRate.mul(100), mintAmount = etherUnsigned(12e18), deltaBlocks = 10;
      await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      await send(comptroller, 'refreshCvpSpeeds');
      const speed = await call(comptroller, 'cvpSpeeds', [cLOW._address]);
      const a2AccruedPre = await cvpAccrued(comptroller, a2);
      const cvpBalancePre = await cvpBalance(comptroller, a2);
      await quickMint(cLOW, a2, mintAmount);
      await fastForward(comptroller, deltaBlocks);
      const tx = await send(comptroller, 'claimCvp', [a2]);
      const a2AccruedPost = await cvpAccrued(comptroller, a2);
      const cvpBalancePost = await cvpBalance(comptroller, a2);
      expect(tx.gasUsed).toBeLessThan(330000);
      expect(speed).toEqualNumber(cvpRate);
      expect(a2AccruedPre).toEqualNumber(0);
      expect(a2AccruedPost).toEqualNumber(0);
      expect(cvpBalancePre).toEqualNumber(0);
      expect(cvpBalancePost).toEqualNumber(cvpRate.mul(deltaBlocks).sub(1)); // index is 8333...
    });

    it('should accrue cvp and then transfer cvp accrued in a single market', async () => {
      const cvpRemaining = cvpRate.mul(100), mintAmount = etherUnsigned(12e18), deltaBlocks = 10;
      await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      await send(comptroller, 'refreshCvpSpeeds');
      const speed = await call(comptroller, 'cvpSpeeds', [cLOW._address]);
      const a2AccruedPre = await cvpAccrued(comptroller, a2);
      const cvpBalancePre = await cvpBalance(comptroller, a2);
      await quickMint(cLOW, a2, mintAmount);
      await fastForward(comptroller, deltaBlocks);
      const tx = await send(comptroller, 'claimCvp', [a2, [cLOW._address]]);
      const a2AccruedPost = await cvpAccrued(comptroller, a2);
      const cvpBalancePost = await cvpBalance(comptroller, a2);
      expect(tx.gasUsed).toBeLessThan(160000);
      expect(speed).toEqualNumber(cvpRate);
      expect(a2AccruedPre).toEqualNumber(0);
      expect(a2AccruedPost).toEqualNumber(0);
      expect(cvpBalancePre).toEqualNumber(0);
      expect(cvpBalancePost).toEqualNumber(cvpRate.mul(deltaBlocks).sub(1)); // index is 8333...
    });

    it('should claim when cvp accrued is below threshold', async () => {
      const cvpRemaining = etherExp(1), accruedAmt = etherUnsigned(0.0009e18)
      await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      await send(comptroller, 'setCvpAccrued', [a1, accruedAmt]);
      await send(comptroller, 'claimCvp', [a1, [cLOW._address]]);
      expect(await cvpAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await cvpBalance(comptroller, a1)).toEqualNumber(accruedAmt);
    });

    it('should revert when a market is not listed', async () => {
      const cNOT = await makeCToken({comptroller});
      await expect(
        send(comptroller, 'claimCvp', [a1, [cNOT._address]])
      ).rejects.toRevert('revert market must be listed');
    });
  });

  describe('claimCvp batch', () => {
    it('should revert when claiming cvp from non-listed market', async () => {
      const cvpRemaining = cvpRate.mul(100), deltaBlocks = 10, mintAmount = etherExp(10);
      await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;

      for(let from of claimAccts) {
        expect(await send(cLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
        send(cLOW.underlying, 'approve', [cLOW._address, mintAmount], { from });
        send(cLOW, 'mint', [mintAmount], { from });
      }

      await pretendBorrow(cLOW, root, 1, 1, etherExp(10));
      await send(comptroller, 'refreshCvpSpeeds');

      await fastForward(comptroller, deltaBlocks);

      await expect(send(comptroller, 'claimCvp', [claimAccts, [cLOW._address, cEVIL._address], true, true])).rejects.toRevert('revert market must be listed');
    });


    it('should claim the expected amount when holders and ctokens arg is duplicated', async () => {
      const cvpRemaining = cvpRate.mul(100), deltaBlocks = 10, mintAmount = etherExp(10);
      await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;
      for(let from of claimAccts) {
        expect(await send(cLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
        send(cLOW.underlying, 'approve', [cLOW._address, mintAmount], { from });
        send(cLOW, 'mint', [mintAmount], { from });
      }
      await pretendBorrow(cLOW, root, 1, 1, etherExp(10));
      await send(comptroller, 'refreshCvpSpeeds');

      await fastForward(comptroller, deltaBlocks);

      const tx = await send(comptroller, 'claimCvp', [[...claimAccts, ...claimAccts], [cLOW._address, cLOW._address], false, true]);
      // cvp distributed => 10e18
      for(let acct of claimAccts) {
        expect(await call(comptroller, 'cvpSupplierIndex', [cLOW._address, acct])).toEqualNumber(etherDouble(1.125));
        expect(await cvpBalance(comptroller, acct)).toEqualNumber(etherExp(1.25));
      }
    });

    it('claims cvp for multiple suppliers only', async () => {
      const cvpRemaining = cvpRate.mul(100), deltaBlocks = 10, mintAmount = etherExp(10);
      await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;
      for(let from of claimAccts) {
        expect(await send(cLOW.underlying, 'harnessSetBalance', [from, mintAmount], { from })).toSucceed();
        send(cLOW.underlying, 'approve', [cLOW._address, mintAmount], { from });
        send(cLOW, 'mint', [mintAmount], { from });
      }
      await pretendBorrow(cLOW, root, 1, 1, etherExp(10));
      await send(comptroller, 'refreshCvpSpeeds');

      await fastForward(comptroller, deltaBlocks);

      const tx = await send(comptroller, 'claimCvp', [claimAccts, [cLOW._address], false, true]);
      // cvp distributed => 10e18
      for(let acct of claimAccts) {
        expect(await call(comptroller, 'cvpSupplierIndex', [cLOW._address, acct])).toEqualNumber(etherDouble(1.125));
        expect(await cvpBalance(comptroller, acct)).toEqualNumber(etherExp(1.25));
      }
    });

    it('claims cvp for multiple borrowers only, primes uninitiated', async () => {
      const cvpRemaining = cvpRate.mul(100), deltaBlocks = 10, mintAmount = etherExp(10), borrowAmt = etherExp(1), borrowIdx = etherExp(1)
      await send(comptroller.cvp, 'transfer', [comptroller._address, cvpRemaining], {from: root});
      let [_,__, ...claimAccts] = saddle.accounts;

      for(let acct of claimAccts) {
        await send(cLOW, 'harnessIncrementTotalBorrows', [borrowAmt]);
        await send(cLOW, 'harnessSetAccountBorrows', [acct, borrowAmt, borrowIdx]);
      }
      await send(comptroller, 'refreshCvpSpeeds');

      await send(comptroller, 'harnessFastForward', [10]);

      const tx = await send(comptroller, 'claimCvp', [claimAccts, [cLOW._address], true, false]);
      for(let acct of claimAccts) {
        expect(await call(comptroller, 'cvpBorrowerIndex', [cLOW._address, acct])).toEqualNumber(etherDouble(2.25));
        expect(await call(comptroller, 'cvpSupplierIndex', [cLOW._address, acct])).toEqualNumber(0);
      }
    });

    it('should revert when a market is not listed', async () => {
      const cNOT = await makeCToken({comptroller});
      await expect(
        send(comptroller, 'claimCvp', [[a1, a2], [cNOT._address], true, true])
      ).rejects.toRevert('revert market must be listed');
    });
  });

  describe('refreshCvpSpeeds', () => {
    it('should start out 0', async () => {
      await send(comptroller, 'refreshCvpSpeeds');
      const speed = await call(comptroller, 'cvpSpeeds', [cLOW._address]);
      expect(speed).toEqualNumber(0);
    });

    it('should get correct speeds with borrows', async () => {
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      const tx = await send(comptroller, 'refreshCvpSpeeds');
      const speed = await call(comptroller, 'cvpSpeeds', [cLOW._address]);
      expect(speed).toEqualNumber(cvpRate);
      expect(tx).toHaveLog(['CvpSpeedUpdated', 0], {
        cToken: cLOW._address,
        newSpeed: speed
      });
      expect(tx).toHaveLog(['CvpSpeedUpdated', 1], {
        cToken: cREP._address,
        newSpeed: 0
      });
      expect(tx).toHaveLog(['CvpSpeedUpdated', 2], {
        cToken: cZRX._address,
        newSpeed: 0
      });
    });

    it('should get correct speeds for 2 assets', async () => {
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      await pretendBorrow(cZRX, a1, 1, 1, 100);
      await send(comptroller, 'refreshCvpSpeeds');
      const speed1 = await call(comptroller, 'cvpSpeeds', [cLOW._address]);
      const speed2 = await call(comptroller, 'cvpSpeeds', [cREP._address]);
      const speed3 = await call(comptroller, 'cvpSpeeds', [cZRX._address]);
      expect(speed1).toEqualNumber(cvpRate.div(4));
      expect(speed2).toEqualNumber(0);
      expect(speed3).toEqualNumber(cvpRate.div(4).mul(3));
    });

    it('should not be callable inside a contract', async () => {
      await pretendBorrow(cLOW, a1, 1, 1, 100);
      await pretendBorrow(cZRX, a1, 1, 1, 100);
      await expect(deploy('RefreshSpeedsProxy', [comptroller._address])).rejects.toRevert('revert only externally owned accounts may refresh speeds');
    });
  });

  describe('_addCvpMarkets', () => {
    it('should correctly add a cvp market if called by admin', async () => {
      const cBAT = await makeCToken({comptroller, supportMarket: true});
      const tx = await send(comptroller, '_addCvpMarkets', [[cBAT._address]]);
      const markets = await call(comptroller, 'getCvpMarkets');
      expect(markets).toEqual([cLOW, cREP, cZRX, cBAT].map((c) => c._address));
      expect(tx).toHaveLog('MarketComped', {
        cToken: cBAT._address,
        isComped: true
      });
    });

    it('should revert if not called by admin', async () => {
      const cBAT = await makeCToken({ comptroller, supportMarket: true });
      await expect(
        send(comptroller, '_addCvpMarkets', [[cBAT._address]], {from: a1})
      ).rejects.toRevert('revert only admin can add cvp market');
    });

    it('should not add non-listed markets', async () => {
      const cBAT = await makeCToken({ comptroller, supportMarket: false });
      await expect(
        send(comptroller, '_addCvpMarkets', [[cBAT._address]])
      ).rejects.toRevert('revert cvp market is not listed');

      const markets = await call(comptroller, 'getCvpMarkets');
      expect(markets).toEqual([cLOW, cREP, cZRX].map((c) => c._address));
    });

    it('should not add duplicate markets', async () => {
      const cBAT = await makeCToken({comptroller, supportMarket: true});
      await send(comptroller, '_addCvpMarkets', [[cBAT._address]]);

      await expect(
        send(comptroller, '_addCvpMarkets', [[cBAT._address]])
      ).rejects.toRevert('revert cvp market already added');
    });

    it('should not write over a markets existing state', async () => {
      const mkt = cLOW._address;
      const bn0 = 10, bn1 = 20;
      const idx = etherUnsigned(1.5e36);

      await send(comptroller, "setCvpSupplyState", [mkt, idx, bn0]);
      await send(comptroller, "setCvpBorrowState", [mkt, idx, bn0]);
      await send(comptroller, "setBlockNumber", [bn1]);
      await send(comptroller, "_dropCvpMarket", [mkt]);
      await send(comptroller, "_addCvpMarkets", [[mkt]]);

      const supplyState = await call(comptroller, 'cvpSupplyState', [mkt]);
      expect(supplyState.block).toEqual(bn1.toString());
      expect(supplyState.index).toEqual(idx.toString());

      const borrowState = await call(comptroller, 'cvpBorrowState', [mkt]);
      expect(borrowState.block).toEqual(bn1.toString());
      expect(borrowState.index).toEqual(idx.toString());
    });
  });

  describe('_dropCvpMarket', () => {
    it('should correctly drop a cvp market if called by admin', async () => {
      const tx = await send(comptroller, '_dropCvpMarket', [cLOW._address]);
      expect(await call(comptroller, 'getCvpMarkets')).toEqual(
        [cREP, cZRX].map((c) => c._address)
      );
      expect(tx).toHaveLog('MarketComped', {
        cToken: cLOW._address,
        isComped: false
      });
    });

    it('should correctly drop a cvp market from middle of array', async () => {
      await send(comptroller, '_dropCvpMarket', [cREP._address]);
      expect(await call(comptroller, 'getCvpMarkets')).toEqual(
        [cLOW, cZRX].map((c) => c._address)
      );
    });

    it('should not drop a cvp market unless called by admin', async () => {
      await expect(
        send(comptroller, '_dropCvpMarket', [cLOW._address], {from: a1})
      ).rejects.toRevert('revert only admin can drop cvp market');
    });

    it('should not drop a cvp market already dropped', async () => {
      await send(comptroller, '_dropCvpMarket', [cLOW._address]);
      await expect(
        send(comptroller, '_dropCvpMarket', [cLOW._address])
      ).rejects.toRevert('revert market is not a cvp market');
    });
  });

  describe('_setCvpRate', () => {
    it('should correctly change cvp rate if called by admin', async () => {
      expect(await call(comptroller, 'cvpRate')).toEqualNumber(etherUnsigned(1e18));
      const tx1 = await send(comptroller, '_setCvpRate', [etherUnsigned(3e18)]);
      expect(await call(comptroller, 'cvpRate')).toEqualNumber(etherUnsigned(3e18));
      const tx2 = await send(comptroller, '_setCvpRate', [etherUnsigned(2e18)]);
      expect(await call(comptroller, 'cvpRate')).toEqualNumber(etherUnsigned(2e18));
      expect(tx2).toHaveLog('NewCvpRate', {
        oldCvpRate: etherUnsigned(3e18),
        newCvpRate: etherUnsigned(2e18)
      });
    });

    it('should not change cvp rate unless called by admin', async () => {
      await expect(
        send(comptroller, '_setCvpRate', [cLOW._address], {from: a1})
      ).rejects.toRevert('revert only admin can change cvp rate');
    });
  });
});
