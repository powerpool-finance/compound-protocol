pragma solidity ^0.5.16;

import "./CErc20.sol";
import "./Governance/GovernorAlphaInterface.sol";

/**
 * @title PowerPool's
 * @notice CTokens which wrap an underlying Comp-compatible governance token
 * @author PowerPool
 */
contract CGovComp is CErc20 {
    /// @notice Emitted when the governorL1 sets tokenVoting address
    event SetTokenVoting(address indexed tokenVoting);

    /// @notice The ppGovernorL1 address
    GovernorAlphaInterface public governorL1;
    /// @notice The address authorized casting a vote and creating proposals
    address public tokenVoting;

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
        GovernorAlphaInterface governorL1_,
        address tokenVoting_,
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_
        ) public {
        // CErc20 and CToken initializers do the bulk of the work
        CErc20.initialize(comptroller_, interestRateModel_, initialExchangeRateMantissa_, name_, symbol_, decimals_);

        governorL1 = governorL1_;
        tokenVoting = tokenVoting_;
    }

    /*** Token Voting Contract Interface ***/

    function castVote(uint proposalId, bool support) external {
        require(msg.sender == tokenVoting, "CGT:castVote: Not a voting manager");
        governorL1.castVote(proposalId, support);
    }

    function propose(address[] memory targets, uint[] memory values, string[] memory signatures, bytes[] memory calldatas, string memory description) public returns (uint) {
        require(msg.sender == tokenVoting, "CGT:castVote: Not a voting manager");
        return governorL1.propose(targets, values, signatures, calldatas, description);
    }

    /*** Token Voting Contract Interface ***/

    function setTokenVoting(address tokenVoting_) external {
        require(msg.sender == address(governorL1), "CGT:setTokenVoting: Only governorL1 allowdd");
        tokenVoting = tokenVoting_;
        emit SetTokenVoting(tokenVoting_);
    }
}
