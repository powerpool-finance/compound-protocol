pragma solidity ^0.5.16;

/**
 * @title Reservoir Contract
 * @notice Distributes a token to a different contract at a fixed rate.
 * @dev This contract must be poked via the `drip()` function every so often.
 * @author Compound
 */
contract Reservoir {

  event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);
  event NewAdmin(address oldAdmin, address newAdmin);

  event NewDripRate(uint oldDripRate, address newDripRate);

  address public admin;
  address public pendingAdmin;

  /// @notice The block number when the Reservoir started (immutable)
  uint public dripStart;

  /// @notice Tokens per block that to drip to target (immutable)
  uint public dripRate;

  /// @notice Reference to token to drip (immutable)
  EIP20Interface public token;

  /// @notice Target to receive dripped tokens (immutable)
  address public target;

  /// @notice Amount that has already been dripped
  uint public dripped;

  /**
    * @notice Constructs a Reservoir
    * @param dripRate_ Numer of tokens per block to drip
    * @param token_ The token to drip
    * @param target_ The recipient of dripped tokens
    */
  constructor(uint dripRate_, EIP20Interface token_, address target_) public {
    dripStart = block.number;
    dripRate = dripRate_;
    token = token_;
    target = target_;
    dripped = 0;

    admin = msg.sender;
  }

  /**
    * @notice Drips the maximum amount of tokens to match the drip rate since inception
    * @dev Note: this will only drip up to the amount of tokens available.
    * @return The amount of tokens dripped in this call
    */
  function drip() public returns (uint) {
    // First, read storage into memory
    EIP20Interface token_ = token;
    uint reservoirBalance_ = token_.balanceOf(address(this)); // TODO: Verify this is a static call
    uint dripRate_ = dripRate;
    uint dripStart_ = dripStart;
    uint dripped_ = dripped;
    address target_ = target;
    uint blockNumber_ = block.number;

    // Next, calculate intermediate values
    uint dripTotal_ = mul(dripRate_, blockNumber_ - dripStart_, "dripTotal overflow");
    uint deltaDrip_ = sub(dripTotal_, dripped_, "deltaDrip underflow");
    uint toDrip_ = min(reservoirBalance_, deltaDrip_);
    uint drippedNext_ = add(dripped_, toDrip_, "tautological");

    // Finally, write new `dripped` value and transfer tokens to target
    dripped = drippedNext_;
    token_.transfer(target_, toDrip_);

    return toDrip_;
  }

  /*** Admin Functions ***/

  function setDripRate(uint _dripRate) external onlyAdmin {
    uint oldDripRate = dripRate;

    dripRate = _dripRate;

    emit NewDripRate(oldDripRate, dripRate);
  }

  /**
    * @notice Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
    * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
    * @param newPendingAdmin New pending admin.
    * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
    */
  function _setPendingAdmin(address payable newPendingAdmin) external onlyAdmin returns (uint) {
    // Save current value, if any, for inclusion in log
    address oldPendingAdmin = pendingAdmin;

    // Store pendingAdmin with value newPendingAdmin
    pendingAdmin = newPendingAdmin;

    emit NewPendingAdmin(oldPendingAdmin, newPendingAdmin);
    return 0;
  }

  /**
    * @notice Accepts transfer of admin rights. msg.sender must be pendingAdmin
    * @dev Admin function for pending admin to accept role and update admin
    * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
    */
  function _acceptAdmin() external returns (uint) {

    require(pendingAdmin == msg.sender, "Msg sender are not pendingAdmin");

    // Save current values for inclusion in log
    address oldAdmin = admin;
    address oldPendingAdmin = pendingAdmin;

    // Store admin with value pendingAdmin
    admin = pendingAdmin;

    // Clear the pending value
    pendingAdmin = address(0);

    emit NewAdmin(oldAdmin, admin);
    emit NewPendingAdmin(oldPendingAdmin, pendingAdmin);
    return 0;
  }

  /* Internal helper functions for safe math */

  function add(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
    uint c = a + b;
    require(c >= a, errorMessage);
    return c;
  }

  function sub(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
    require(b <= a, errorMessage);
    uint c = a - b;
    return c;
  }

  function mul(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
    if (a == 0) {
      return 0;
    }
    uint c = a * b;
    require(c / a == b, errorMessage);
    return c;
  }

  function min(uint a, uint b) internal pure returns (uint) {
    if (a <= b) {
      return a;
    } else {
      return b;
    }
  }
}

import "./EIP20Interface.sol";
