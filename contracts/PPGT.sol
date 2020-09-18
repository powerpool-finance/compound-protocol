pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./CErc20.sol";
import "./Governance/GovernorAlphaInterface.sol";

/**
 * @title PowerPool's PPGT Contract
 * @notice ppToken which wrap an underlying Comp-compatible governance token
 * @author PowerPool
 */
contract PPGT is CErc20 {
    /// @notice Emitted when the votingAddressManager sets tokenVoting address
    event SetGovernorContract(address indexed governorContract);

    /// @notice Emitted when the votingAddressManager sets tokenVoting address
    event SetVoteCaster(address indexed voteCaster);

    /// @notice The address of GovernorAlpha-compatible governance contract
    GovernorAlphaInterface public governorContract;

    /// @notice The address authorized casting a vote and creating proposals
    address public voteCaster;

    /// @notice The address which is eligible setting `governorContract` and `voteCaster` addresses
    address public votingAddressManager;

    /**
     * @notice Initialize the new Comp-compatible money market
     * @param underlying_ The address of the underlying asset
     * @param comptroller_ The address of the Comptroller
     * @param interestRateModel_ The address of the interest rate model
     * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
     * @param name_ ERC-20 name of this token
     * @param symbol_ ERC-20 symbol of this token
     * @param decimals_ ERC-20 decimal precision of this token
     */
    function initialize(
        GovernorAlphaInterface governorContract_,
        address voteCaster_,
        address votingAddressManager_,
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_
        ) public {
        // CErc20 and CToken initializers do the bulk of the work
        CErc20.initialize(underlying_, comptroller_, interestRateModel_, initialExchangeRateMantissa_, name_, symbol_, decimals_);

        governorContract = governorContract_;
        voteCaster = voteCaster_;
        votingAddressManager = votingAddressManager_;
    }

    /*** Permissionless Interface ***/

    function selfDelegate() external {
        CvpInterface(underlying).delegate(address(this));
    }

    /*** Token Voting Contract Interface ***/

    function castVote(uint proposalId, bool support) external {
        require(msg.sender == voteCaster, "CGT:castVote: Only voteCaster allowed");
        governorContract.castVote(proposalId, support);
    }

    function propose(address[] memory targets, uint[] memory values, string[] memory signatures, bytes[] memory calldatas, string memory description) public returns (uint) {
        require(msg.sender == voteCaster, "CGT:castVote: Only voteCaster allowed");
        return governorContract.propose(targets, values, signatures, calldatas, description);
    }

    /*** Token Voting Contract Interface ***/

    function setGovernorContract(address governorContract_) external {
        require(msg.sender == votingAddressManager, "CGT:setGovernorContract: Only votingAddressManager allowed");
        governorContract = GovernorAlphaInterface(governorContract_);
        emit SetGovernorContract(governorContract_);
    }

    function setVoteCaster(address voteCaster_) external {
        require(msg.sender == votingAddressManager, "CGT:setVoteCaster: Only votingAddressManager allowed");
        voteCaster = voteCaster_;
        emit SetVoteCaster(voteCaster_);
    }
}
