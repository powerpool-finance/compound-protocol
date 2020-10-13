pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./Governance/GovernorAlphaInterface.sol";
import "./CErc20Delegate.sol";

/**
 * @title PowerPool's PPGtDelegate Contract
 * @notice ppToken which wrap an underlying Comp-compatible governance token
 * @author PowerPool
 */
contract PPGtDelegate is CErc20Delegate {
    /// @notice Emitted when the admin sets tokenVoting address
    event SetGovernorAlpha(address indexed governorAlpha);

    /// @notice Emitted when the admin sets tokenVoting address
    event SetVoteCaster(address indexed voteCaster);

    /// @notice The address of GovernorAlpha-compatible governance contract
    GovernorAlphaInterface public governorAlpha;

    /// @notice The address authorized casting votes and creating proposals
    address public voteCaster;

    /**
     * @notice Delegate interface to become the implementation
     * @param data The encoded arguments for becoming
     */
    function _becomeImplementation(bytes memory data) public {
        require(msg.sender == admin, "only the admin may initialize the implementation");

        (address governorAlpha_, address voteCaster_) = abi.decode(data, (address, address));
        return _becomeImplementation(governorAlpha_, voteCaster_);
    }

    /**
     * @notice Explicit interface to become the implementation
     * @param governorAlpha_ The address of GovernorAlpha to use with the underlying asset
     * @param voteCaster_ The address eligible casting votes and creating proposals
     */
    function _becomeImplementation(
        address governorAlpha_,
        address voteCaster_
    ) internal {
        governorAlpha = GovernorAlphaInterface(governorAlpha_);
        voteCaster = voteCaster_;
    }

    /**
     * @notice Delegate interface to resign the implementation
     * @dev Nothing required
     */
    function _resignImplementation() public {
        require(msg.sender == admin, "only the admin may abandon the implementation");
    }

    /*** Permissionless Interface ***/

    function selfDelegate() external {
        CvpInterface(underlying).delegate(address(this));
    }

    /*** Token Voting Contract Interface ***/

    function castVote(uint proposalId, bool support) external {
        require(msg.sender == voteCaster, "PPGT:castVote: Only voteCaster allowed");
        governorAlpha.castVote(proposalId, support);
    }

    function propose(address[] memory targets, uint[] memory values, string[] memory signatures, bytes[] memory calldatas, string memory description) public returns (uint) {
        require(msg.sender == voteCaster, "PPGT:castVote: Only voteCaster allowed");
        return governorAlpha.propose(targets, values, signatures, calldatas, description);
    }

    /*** Admin Interface ***/

    function setGovernorAlpha(address governorAlpha_) external {
        require(msg.sender == admin, "PPGT:setGovernorAlpha: Only admin allowed");
        governorAlpha = GovernorAlphaInterface(governorAlpha_);
        emit SetGovernorAlpha(governorAlpha_);
    }

    function setVoteCaster(address voteCaster_) external {
        require(msg.sender == admin, "PPGT:setVoteCaster: Only admin allowed");
        voteCaster = voteCaster_;
        emit SetVoteCaster(voteCaster_);
    }
}
