// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IGymMarketplace {
    struct Listing {
        address seller;
        uint256 priceWei;
        string name;
        string category;
        string license;
        bool active;
    }

    function getListing(bytes32 rootHashKey) external view returns (Listing memory);
    function creditRoyalty(address builder, uint256 amount) external payable;
}

interface ITrainingEscrow {
    function estimateCost(uint32 numEpisodes, uint8 loraRank) external pure returns (uint256);
}
