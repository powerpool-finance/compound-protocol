// SPDX-License-Identifier: MIT
pragma solidity 0.5.16;

import "powerpool-protocol/contracts/SimplePriceOracle.sol";

contract AdministratedPriceOracle is SimplePriceOracle {

  address public admin;
  mapping(address => bool) public managers;

  event ChangeAdmin(address admin);
  event SetManager(address manager, bool active);

  modifier onlyAdmin() {
    require(admin == msg.sender, "Msg sender is not admin");
    _;
  }

  modifier onlyAdminOrManager() {
    require(admin == msg.sender || managers[msg.sender], "Msg sender is not admin or manager");
    _;
  }

  constructor(address _admin) public {
    admin = _admin;
  }

  function changeAdmin(address _admin) external onlyAdmin {
    admin = _admin;
    emit ChangeAdmin(_admin);
  }

  function setManager(address _manager, bool _active) external onlyAdmin {
    managers[_manager] = _active;
    emit SetManager(_manager, _active);
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
}
