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
    /// @notice Emitted when the votingAddressManager sets tokenVoting address
    event SetGovernorContract(address indexed governorContract);

    /// @notice Emitted when the votingAddressManager sets tokenVoting address
    event SetVoteCaster(address indexed voteCaster);

    /// @notice The address of GovernorAlpha-compatible governance contract
    GovernorAlphaInterface public governorAlpha;

    /// @notice The address authorized casting a vote and creating proposals
    address public voteCaster;

    /// @notice The address which is eligible setting `governorContract` and `voteCaster` addresses
    address public votingAddressManager;

    /**
     * @notice Delegate interface to become the implementation
     * @param data The encoded arguments for becoming
     */
    function _becomeImplementation(bytes memory data) public {
        require(msg.sender == admin, "only the admin may initialize the implementation");

        (address governorAlpha_, address voteCaster_, address manager_) = abi.decode(data, (address, address, address));
        return _becomeImplementation(governorAlpha_, voteCaster_, manager_);
    }

    /**
     * @notice Explicit interface to become the implementation
     * @param governorAlpha_ The address of GovernorAlpha to use with the underlying asset
     * @param voteCaster_ The address eligible casting a vote decisions and proposals
     * @param votingAddressManager_ The address for `governorAlpha` and `voteCaster` address management
     */
    function _becomeImplementation(
        address governorAlpha_,
        address voteCaster_,
        address votingAddressManager_
    ) internal {
        governorAlpha = GovernorAlphaInterface(governorAlpha_);
        voteCaster = voteCaster_;
        votingAddressManager = votingAddressManager_;
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
        require(msg.sender == voteCaster, "CGT:castVote: Only voteCaster allowed");
        governorAlpha.castVote(proposalId, support);
    }

    function propose(address[] memory targets, uint[] memory values, string[] memory signatures, bytes[] memory calldatas, string memory description) public returns (uint) {
        require(msg.sender == voteCaster, "CGT:castVote: Only voteCaster allowed");
        return governorAlpha.propose(targets, values, signatures, calldatas, description);
    }

    /*** Voting Address Manager Interface ***/

    function setGovernorAlpha(address governorAlpha_) external {
        require(msg.sender == votingAddressManager, "CGT:setGovernorAlpha: Only votingAddressManager allowed");
        governorAlpha = GovernorAlphaInterface(governorAlpha_);
        emit SetGovernorContract(governorAlpha_);
    }

    function setVoteCaster(address voteCaster_) external {
        require(msg.sender == votingAddressManager, "CGT:setVoteCaster: Only votingAddressManager allowed");
        voteCaster = voteCaster_;
        emit SetVoteCaster(voteCaster_);
    }

    function transferVotingAddressManagerPermissions(address votingAddressManager_) external {
        votingAddressManager = votingAddressManager_;
    }
}
