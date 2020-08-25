pragma solidity ^0.5.16;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "./CTokenRestrictionsInterface.sol";


contract CTokenRestrictions is CTokenRestrictionsInterface {
  using EnumerableSet for EnumerableSet.AddressSet;

  event AddWhitelistedUser(address indexed user, address indexed admin);
  event UpdateWhitelistedUser(address indexed user, address indexed admin);
  event RemoveWhitelistedUser(address indexed user, address indexed admin);

  event SetWhitelistDisabled(bool whitelistDisabled, address indexed admin);

  event SetUserRestrictions(address indexed user, address indexed admin, address indexed token, uint256 maxMint, uint256 maxBorrow);
  event SetDefaultRestrictions(address indexed admin, address indexed token, uint256 maxMint, uint256 maxBorrow);

  event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);
  event NewAdmin(address oldAdmin, address newAdmin);

  EnumerableSet.AddressSet internal usersWhiteList;

  struct UserRestrictions {
    uint256 maxMint;
    uint256 maxBorrow;
  }

  // token => restrictions
  mapping(address => UserRestrictions) public defaultRestrictions;
  // user => token => restrictions
  mapping(address => mapping(address => UserRestrictions)) public userRestrictions;

  bool public whitelistDisabled;

  address public admin;
  address public pendingAdmin;

  modifier onlyAdmin() {
    require(msg.sender == admin, "Msg sender are not admin");
    _;
  }

  constructor() public {
    admin = msg.sender;
  }

  /*** Admin Functions ***/

  function addUserToWhiteList(address[] calldata _userList, address[] calldata _tokenList, uint256[] calldata _maxMintList, uint256[] calldata _maxBorrowList) external onlyAdmin {
    uint256 len = _userList.length;

    for(uint256 i = 0; i < len; i++) {
      usersWhiteList.add(_userList[i]);
      emit AddWhitelistedUser(_userList[i], msg.sender);
      _setUserRestrictions(_userList[i], _tokenList, _maxMintList, _maxBorrowList);
    }
  }

  function updateUserRestrictions(address[] calldata _userList, address[] calldata _tokenList, uint256[] calldata _maxMintList, uint256[] calldata _maxBorrowList) external onlyAdmin {
    uint256 len = _userList.length;

    for(uint256 i = 0; i < len; i++) {
      _setUserRestrictions(_userList[i], _tokenList, _maxMintList, _maxBorrowList);

      emit UpdateWhitelistedUser(_userList[i], msg.sender);
    }
  }

  function removeUserFromWhiteList(address[] calldata _userList) external onlyAdmin {
    uint256 len = _userList.length;

    for(uint256 i = 0; i < len; i++) {
      usersWhiteList.remove(_userList[i]);

      emit RemoveWhitelistedUser(_userList[i], msg.sender);
    }
  }

  function setDefaultRestrictions(address[] calldata _tokenList, uint256[] calldata _maxMintList, uint256[] calldata _maxBorrowList) external onlyAdmin {
    _setDefaultRestrictions(_tokenList, _maxMintList, _maxBorrowList);
  }

  function setWhitelistDisabled(bool _whitelistDisabled) external onlyAdmin {
    whitelistDisabled = _whitelistDisabled;

    emit SetWhitelistDisabled(_whitelistDisabled, msg.sender);
  }

  /*** View Functions ***/
  
  function isUserInWhiteList(address _user) external view returns (bool) {
    return usersWhiteList.contains(_user);
  }

  function validateWhitelistedUser(address _user) public view {
    require(whitelistDisabled || usersWhiteList.contains(_user), "NOT_IN_WHITELIST_ERROR");
  }

  function getUserRestrictionsAndValidateWhitelist(address _user, address _token) external view returns(uint256 maxMint, uint256 maxBorrow) {
    validateWhitelistedUser(_user);

    UserRestrictions storage restrictions = userRestrictions[_user][_token];
    if(restrictions.maxMint == 0) {
      restrictions = defaultRestrictions[_token];
    }
    return (restrictions.maxMint, restrictions.maxBorrow);
  }

  function getUsersWhiteList() external view returns (address[] memory) {
    return usersWhiteList.enumerate();
  }

  function getUsersWhiteListCount() external view returns (uint256) {
    return usersWhiteList.length();
  }

  /*** Internal Functions ***/

  function _setDefaultRestrictions(address[] memory _tokenList, uint256[] memory _maxMintList, uint256[] memory _maxBorrowList) internal {
    uint256 len = _tokenList.length;
    require(len == _maxMintList.length && len == _maxBorrowList.length, "Arrays lengths are not equals");

    for(uint256 i = 0; i < len; i++) {
      defaultRestrictions[_tokenList[i]] = UserRestrictions(_maxMintList[i], _maxBorrowList[i]);
      emit SetDefaultRestrictions(msg.sender, _tokenList[i], _maxMintList[i], _maxBorrowList[i]);
    }
  }
  
  function _setUserRestrictions(address _user, address[] memory _tokenList, uint256[] memory _maxMintList, uint256[] memory _maxBorrowList) internal {
    uint256 len = _tokenList.length;
    require(len == _maxMintList.length && len == _maxBorrowList.length, "Arrays lengths are not equals");
    
    for(uint256 i = 0; i < len; i++) {
      userRestrictions[_user][_tokenList[i]] = UserRestrictions(_maxMintList[i], _maxBorrowList[i]);
      emit SetUserRestrictions(_user, msg.sender, _tokenList[i], _maxMintList[i], _maxBorrowList[i]);
    }
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
