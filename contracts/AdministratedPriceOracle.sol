pragma solidity 0.5.16;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "./SimplePriceOracle.sol";

contract AdministratedPriceOracle is SimplePriceOracle {
  using EnumerableSet for EnumerableSet.AddressSet;

  address public admin;
  address public pendingAdmin;
  EnumerableSet.AddressSet internal managers;

  event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);
  event NewAdmin(address oldAdmin, address newAdmin);
  event AddManager(address manager);
  event RemoveManager(address manager);

  modifier onlyAdmin() {
    require(admin == msg.sender, "Msg sender is not admin");
    _;
  }

  modifier onlyAdminOrManager() {
    require(admin == msg.sender || isManager(msg.sender), "Msg sender is not admin or manager");
    _;
  }

  constructor() public {
    admin = msg.sender;
  }

  function addManager(address _manager) external onlyAdmin {
    managers.add(_manager);
    emit AddManager(_manager);
  }

  function removeManager(address _manager) external onlyAdmin {
    managers.remove(_manager);
    emit RemoveManager(_manager);
  }

  function setUnderlyingPrice(CToken cToken, uint underlyingPriceMantissa) public onlyAdminOrManager {
    super.setUnderlyingPrice(cToken, underlyingPriceMantissa);
  }

  function setDirectPrice(address asset, uint price) public onlyAdminOrManager {
    super.setDirectPrice(asset, price);
  }

  function getPrice(CToken cToken) public view returns (uint) {
    return getUnderlyingPrice(cToken);
  }

  function isManager(address _user) public view returns (bool) {
    return managers.contains(_user);
  }

  /*** Admin Transferring Functions ***/

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
}
