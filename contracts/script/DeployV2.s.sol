// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {DeploymentFile} from "./DeploymentFile.sol";
import {StreamQuestDeployer} from "./StreamQuestDeployer.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {TipReceiver} from "../src/TipReceiver.sol";

/// @notice Adds contract v2 to the live Monad deployment, leaving every v1 contract as it is:
///         - the Community Pool (treasury yield): MockMON, MokoSwap, MockLST, LstStrategy and
///           CommunityPoolVault, which becomes the SplitVault's strategy;
///         - TipReceiver, the Monad end of cross-chain tips (peers are set later, by
///           SetTipPeer.s.sol, once TipSender exists on the other chain).
///
///         Run it with the key that deployed v1 (it owns MockUSD and is the SplitVault admin):
///
///           forge script script/DeployV2.s.sol --rpc-url monad_testnet              (dry run)
///           forge script script/DeployV2.s.sol --rpc-url monad_testnet --broadcast
///
///         Env: PRIVATE_KEY; optional CURATOR (an extra address allowed to set the pool's mix,
///         e.g. the demo creator's smart account) and LZ_ENDPOINT. A dry run changes no file.
contract DeployV2 is DeploymentFile, StreamQuestDeployer {
    /// @dev LayerZero EndpointV2 on the current Monad testnet (EID 40442)
    address constant MONAD_TESTNET_ENDPOINT = 0x3aCAAf60502791D199a5a5F0B173D78229eBFe32;

    function run() external {
        string memory path = _deploymentPath();
        string memory json = vm.readFile(path);
        require(!vm.keyExistsJson(json, ".CommunityPoolVault"), "v2 is already in the deployment file");

        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        address endpoint = vm.envOr("LZ_ENDPOINT", MONAD_TESTNET_ENDPOINT);
        address curator = vm.envOr("CURATOR", address(0));

        MockUSD usd = MockUSD(vm.parseJsonAddress(json, ".MockUSD"));
        SplitVault vault = SplitVault(vm.parseJsonAddress(json, ".SplitVault"));
        IERC4626 stable = IERC4626(vm.parseJsonAddress(json, ".MockYieldVault"));

        // before spending gas: the file matches this chain and this key can wire everything
        require(address(vault.token()) == address(usd), "SplitVault does not use this MockUSD");
        require(stable.asset() == address(usd), "MockYieldVault is not a MockUSD vault");
        require(usd.owner() == me, "PRIVATE_KEY does not own MockUSD");
        require(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), me), "PRIVATE_KEY is not the SplitVault admin");
        require(vault.totalTreasuryShares() == 0, "a treasury is still invested in the old strategy: exitStrategy it first");
        require(endpoint.code.length != 0, "no LayerZero endpoint at LZ_ENDPOINT");

        vm.startBroadcast(pk);
        Pool memory p = _deployPool(usd, stable, vault, me, defaultPoolConfig());
        if (curator != address(0)) p.pool.grantRole(p.pool.CURATOR(), curator);
        TipReceiver receiver = _deployTipReceiver(endpoint, usd, vault, me);
        vm.stopBroadcast();

        require(address(vault.strategy()) == address(p.pool), "the pool is not the SplitVault strategy");
        require(usd.minters(address(receiver)), "TipReceiver cannot mint");
        require(vault.hasRole(vault.DEPOSIT_RELAYER(), address(receiver)), "TipReceiver cannot credit donors");

        console2.log("MockMON", address(p.mon));
        console2.log("MokoSwap", address(p.swap));
        console2.log("MockLST", address(p.lst));
        console2.log("LstStrategy", address(p.lstLeg));
        console2.log("CommunityPoolVault", address(p.pool));
        console2.log("TipReceiver", address(receiver));

        if (!_broadcasting()) {
            console2.log("Dry run: nothing was sent and", path, "was not changed");
            return;
        }
        string[] memory keys = new string[](6);
        address[] memory values = new address[](6);
        (keys[0], values[0]) = ("MockMON", address(p.mon));
        (keys[1], values[1]) = ("MokoSwap", address(p.swap));
        (keys[2], values[2]) = ("MockLST", address(p.lst));
        (keys[3], values[3]) = ("LstStrategy", address(p.lstLeg));
        (keys[4], values[4]) = ("CommunityPoolVault", address(p.pool));
        (keys[5], values[5]) = ("TipReceiver", address(receiver));
        _record(json, path, keys, values);
        console2.log("Deployment updated", path);
    }
}
