interface AggregatorV3Interface2 {
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

    function latestAnswer() external view returns (uint256);
}

// Contract example (Chainlink's COMP/USD price feed) https://etherscan.io/address/0xdbd020CAeF83eFd542f4De03e3cF0C28A4428bd5#code


contract MockProxy is AggregatorV3Interface2 {
    uint256 public latestAnswer;

    function setLatestAnswer(uint256 _latestAnswer) external {
        latestAnswer = _latestAnswer;
    }
}