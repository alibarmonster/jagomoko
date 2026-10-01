// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Jury} from "./Jury.sol";
import {IJuryClient, Verdict} from "./Types.sol";

/// @notice Shared propose -> challenge window -> finalize flow. The creator
///         proposes an outcome with a proof link; any participant can dispute
///         within the window, which escalates to the Jury.
abstract contract OptimisticResolver is IJuryClient {
    enum Stage {
        Open,
        Proposed,
        Disputed,
        Resolved
    }

    struct Resolution {
        Stage stage;
        Verdict proposed;
        Verdict verdict;
        uint64 proposedAt;
        address proposer;
        uint256 caseId;
        string proofURI;
    }

    Jury public immutable jury;
    uint64 public immutable challengeWindow;

    mapping(uint256 => Resolution) internal _resolutions;

    event OutcomeProposed(uint256 indexed marketId, Verdict verdict, address indexed proposer, string proofURI, uint64 challengeDeadline);
    event OutcomeDisputed(uint256 indexed marketId, address indexed disputer, uint256 caseId);
    event MarketResolved(uint256 indexed marketId, Verdict verdict);

    error WrongStage();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error NotParticipant();
    error NotJury();

    constructor(Jury jury_, uint64 challengeWindow_) {
        jury = jury_;
        challengeWindow = challengeWindow_;
    }

    function resolutionOf(uint256 marketId) external view returns (Resolution memory) {
        return _resolutions[marketId];
    }

    function dispute(uint256 marketId) external {
        Resolution storage r = _resolutions[marketId];
        if (r.stage != Stage.Proposed) revert WrongStage();
        if (block.timestamp >= r.proposedAt + challengeWindow) revert ChallengeWindowClosed();
        if (!isParticipant(marketId, msg.sender)) revert NotParticipant();
        r.stage = Stage.Disputed;
        r.caseId = jury.openCase(marketId, _creatorOf(marketId));
        emit OutcomeDisputed(marketId, msg.sender, r.caseId);
    }

    function finalize(uint256 marketId) external {
        Resolution storage r = _resolutions[marketId];
        if (r.stage != Stage.Proposed) revert WrongStage();
        if (block.timestamp < r.proposedAt + challengeWindow) revert ChallengeWindowOpen();
        _resolve(marketId, r.proposed);
    }

    function onJuryVerdict(uint256 marketId, Verdict verdict) external {
        if (msg.sender != address(jury)) revert NotJury();
        if (_resolutions[marketId].stage != Stage.Disputed) revert WrongStage();
        _resolve(marketId, verdict);
    }

    function isParticipant(uint256 marketId, address account) public view virtual returns (bool);

    function _propose(uint256 marketId, Verdict verdict, string calldata proofURI) internal {
        Resolution storage r = _resolutions[marketId];
        if (r.stage != Stage.Open) revert WrongStage();
        r.stage = Stage.Proposed;
        r.proposed = verdict;
        r.proposedAt = uint64(block.timestamp);
        r.proposer = msg.sender;
        r.proofURI = proofURI;
        emit OutcomeProposed(marketId, verdict, msg.sender, proofURI, r.proposedAt + challengeWindow);
    }

    function _resolve(uint256 marketId, Verdict verdict) internal {
        Resolution storage r = _resolutions[marketId];
        r.stage = Stage.Resolved;
        r.verdict = verdict;
        emit MarketResolved(marketId, verdict);
        _onResolved(marketId, verdict);
    }

    function _stage(uint256 marketId) internal view returns (Stage) {
        return _resolutions[marketId].stage;
    }

    function _creatorOf(uint256 marketId) internal view virtual returns (uint256);

    function _onResolved(uint256 marketId, Verdict verdict) internal virtual;
}
