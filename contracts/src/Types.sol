// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Outcome of an optimistically-resolved market (quest or battle).
enum Verdict {
    None,
    Yes, // quest succeeded / battle side 0 won
    No, // quest failed / battle side 1 won
    Invalid // unresolvable (jury tie / no votes) -> full refund
}

/// @notice Why XP was granted. Each role gets a bonus on its specialty.
enum XPKind {
    Back, // Knight specialty
    Predict, // Seer specialty
    Jury, // Judge specialty
    Clip, // Bard specialty
    Tip,
    Governance
}

interface IJuryClient {
    /// @return true if `account` has a stake in `marketId` (excluded from jury duty)
    function isParticipant(uint256 marketId, address account) external view returns (bool);
    /// @notice called by the jury once a case is decided
    function onJuryVerdict(uint256 marketId, Verdict verdict) external;
}
