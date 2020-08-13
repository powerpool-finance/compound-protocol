pragma solidity ^0.5.16;


interface CTokenRestrictionsInterface {
    function getUserRestrictionsAndValidateWhitelist(address _user, address _token) external view returns(uint256 maxMint, uint256 maxBorrow);
    function validateWhitelistedUser(address _user) external view;
}