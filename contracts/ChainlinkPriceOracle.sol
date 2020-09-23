pragma solidity 0.5.16;

import "./PriceOracle.sol";
import "./CErc20.sol";


import "@openzeppelin/contracts/ownership/Ownable.sol";

/// @title ChainlinkProxyPriceOracle
/// @author PowerPool
/// @notice Proxy smart contract to get the price of an asset from a price source, with Chainlink Aggregator
///         smart contracts as primary option
/// - If the returned price by a Chainlink aggregator is <= 0, the call is forwarded to a fallbackOracle
/// - Owned by the PowerPool governance system, allowed to add sources for assets, replace them
///   and change the fallbackOracle
contract ChainlinkProxyPriceOracle is PriceOracle, Ownable {

  event AssetSourceUpdated(address indexed asset, address indexed source);
  event FallbackOracleUpdated(address indexed fallbackOracle);

  mapping(address => AggregatorV3Interface) private assetsSources;
  PriceOracle private fallbackOracle;

  /// @notice Constructor
  /// @param _assets The addresses of the assets
  /// @param _sources The address of the source of each asset
  /// @param _fallbackOracle The address of the fallback oracle to use if the data of an
  ///        aggregator is not consistent
  constructor(address[] memory _assets, address[] memory _sources, address _fallbackOracle) public {
    internalSetFallbackOracle(_fallbackOracle);
    internalSetAssetsSources(_assets, _sources);
  }

  /// @notice External function called by the PowerPool governance to set or replace sources of assets
  /// @param _assets The addresses of the assets
  /// @param _sources The address of the source of each asset
  function setAssetSources(address[] calldata _assets, address[] calldata _sources) external onlyOwner {
    internalSetAssetsSources(_assets, _sources);
  }

  /// @notice Sets the fallbackOracle
  /// - Callable only by the PowerPool governance
  /// @param _fallbackOracle The address of the fallbackOracle
  function setFallbackOracle(address _fallbackOracle) external onlyOwner {
    internalSetFallbackOracle(_fallbackOracle);
  }

  /// @notice Internal function to set the sources for each asset
  /// @param _assets The addresses of the assets
  /// @param _sources The address of the source of each asset
  function internalSetAssetsSources(address[] memory _assets, address[] memory _sources) internal {
    require(_assets.length == _sources.length, "INCONSISTENT_PARAMS_LENGTH");
    for (uint256 i = 0; i < _assets.length; i++) {
      assetsSources[_assets[i]] = AggregatorV3Interface(_sources[i]);
      emit AssetSourceUpdated(_assets[i], _sources[i]);
    }
  }

  /// @notice Internal function to set the fallbackOracle
  /// @param _fallbackOracle The address of the fallbackOracle
  function internalSetFallbackOracle(address _fallbackOracle) internal {
    fallbackOracle = PriceOracle(_fallbackOracle);
    emit FallbackOracleUpdated(_fallbackOracle);
  }

  function compareStrings(string memory _a, string memory _b) internal pure returns (bool) {
    return (keccak256(abi.encodePacked((_a))) == keccak256(abi.encodePacked((_b))));
  }

  /// @notice Gets an asset price by address
  /// @param _cToken The asset address
  function getUnderlyingPrice(CToken _cToken) public view returns(uint256) {
    address asset = address(CErc20(address(_cToken)).underlying());
    AggregatorV3Interface source = assetsSources[asset];
    if (compareStrings(_cToken.symbol(), "ppETH")) {
      return 1 ether;
    } else {
      // If there is no registered source for the asset, call the fallbackOracle
      if (address(source) == address(0)) {
        return PriceOracle(fallbackOracle).getUnderlyingPrice(_cToken);
      } else {
        int256 _price = AggregatorV3Interface(source).latestAnswer();
        if (_price > 0) {
          return uint256(_price);
        } else {
          return PriceOracle(fallbackOracle).getUnderlyingPrice(_cToken);
        }
      }
    }
  }

  /// @notice Gets a list of prices from a list of assets addresses
  /// @param _cTokens The list of assets addresses
  function getUnderlyingPrices(CToken[] calldata _cTokens) external view returns(uint256[] memory) {
    uint256[] memory prices = new uint256[](_cTokens.length);
    for (uint256 i = 0; i < _cTokens.length; i++) {
      prices[i] = getUnderlyingPrice(_cTokens[i]);
    }
    return prices;
  }

  /// @notice Gets the address of the source for an asset address
  /// @param _asset The address of the asset
  /// @return address The address of the source
  function getSourceOfAsset(address _asset) external view returns(address) {
    return address(assetsSources[_asset]);
  }

  /// @notice Gets the address of the fallback oracle
  /// @return address The addres of the fallback oracle
  function getFallbackOracle() external view returns(address) {
    return address(fallbackOracle);
  }
}

interface AggregatorV3Interface {

  function decimals() external view returns (uint8);
  function description() external view returns (string memory);
  function version() external view returns (uint256);

  // getRoundData and latestRoundData should both raise "No data present"
  // if they do not have data to report, instead of returning unset values
  // which could be misinterpreted as actual reported values.
  function getRoundData(uint80 _roundId)
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    );

  function latestRoundData()
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    );
  function latestAnswer() external view returns (int256);
}

