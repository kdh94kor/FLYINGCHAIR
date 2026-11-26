// ── Single Source of Truth (SSOT) Player State System ────────────────
const PlayerState = {
    // 모든 플레이어 상태 상수
    STATUS: {
        IDLE: 'idle',                 // 착석 중 (정상 착석 및 활동 가능)
        FLYING: 'flying',             // 공중 비행 중 (의자 발사 포물선)
        SWIMMING: 'swimming',         // 수영 중 (물속에 빠짐)
        WALKING: 'walking',           // 복귀 중 (물에서 나와 의자로 걷는 중)
        DEAD_SHARK: 'dead',           // 상어에게 물림 (30초 심해 침수 기절)
        DEAD_GATOR: 'dead-gator',     // 악어 떼에게 물림 (15초 수영장 기절)
        SNATCHED_GULL: 'snatched',    // 부산갈매기에게 납치됨 (1분 상공 기절/채팅불가)
        DEAD_MISSILE: 'dead-missile', // 미사일 피격 (30초 의자 반전 기절)
        DEAD_BOMB: 'dead-bomb',       // 폭탄 폭발 피격 (10초 그을림/머리 삐죽 기절)
        SALT_FARM: 'salt-farm',       // 염전 납치 노역 (소금 100% 채취 시 복귀)
        DUELING: 'dueling',           // 결투장 링 위에서 1:1 결투 진행 중
        DEAD_DUEL: 'dead-duel'        // 결투 패배 (30초 의자 눈탱이 밤탱이 기절)
    },

    // 1. 좌석 이탈 상태 목록 (의자에서 튕겨나가 공중, 물속, 심해, 납치, 염전, 결투장 등 자리를 벗어난 상태)
    AWAY_STATUSES: ['flying', 'swimming', 'walking', 'dead', 'dead-gator', 'snatched', 'salt-farm', 'dueling'],

    // 2. 동물 3종(상어/악어/부산갈매기)에게 잡힌 상태 목록
    ANIMAL_CAUGHT_STATUSES: ['dead', 'dead-gator', 'snatched'],

    // 3. 행동 불능/기절 상태 목록 (상어, 악어, 갈매기, 미사일, 폭탄, 염전, 결투 중/패배 기절로 일반 행동/채팅 불가)
    INCAPACITATED_STATUSES: ['dead', 'dead-gator', 'snatched', 'dead-missile', 'dead-bomb', 'salt-farm', 'dueling', 'dead-duel'],

    // 상태 문자열 안전 추출 헬퍼 (플레이어 객체 또는 문자열 수용)
    _toStatus(p) {
        if (!p) return null;
        return typeof p === 'string' ? p : p.status;
    },

    // [1. 착석 상태 체크]
    // 물리적으로 의자 자리에 위치해 있는가? (정상 idle 착석 또는 미사일/폭탄/결투 패배로 자리에 남아 있는 상태)
    isSeated(p) {
        const s = this._toStatus(p);
        return s === this.STATUS.IDLE || s === this.STATUS.DEAD_MISSILE || s === this.STATUS.DEAD_BOMB || s === this.STATUS.DEAD_DUEL;
    },

    // 정상적으로 건강하게 착석해 있는가? (디버프 없이 채팅 및 아이템 조준 타깃이 가능한 완전한 idle 상태)
    isHealthySeated(p) {
        return this._toStatus(p) === this.STATUS.IDLE;
    },

    // [2. 이탈 상태 체크]
    // 의자에서 튕겨나가 자리를 비운 상태인가? (공중 비행, 수영, 복귀 보행, 상어/악어/갈매기에게 잡힌 상태 모두 포함)
    isAway(p) {
        return this.AWAY_STATUSES.includes(this._toStatus(p));
    },

    // 비행 또는 수영/보행 등 물리적 이동 모션 진행 중인가?
    isMoving(p) {
        const s = this._toStatus(p);
        return s === this.STATUS.FLYING || s === this.STATUS.SWIMMING || s === this.STATUS.WALKING;
    },

    // [3. 동물 포획 상태 체크]
    // 악어, 상어, 부산갈매기 중 하나에게 잡힌 상태인가?
    isCaughtByAnimal(p) {
        return this.ANIMAL_CAUGHT_STATUSES.includes(this._toStatus(p));
    },

    // 어떤 동물에게 잡혔는지 확인 ('shark' | 'gator' | 'gull' | null)
    getCaughtAnimal(p) {
        const s = this._toStatus(p);
        if (s === this.STATUS.DEAD_SHARK) return 'shark';
        if (s === this.STATUS.DEAD_GATOR) return 'gator';
        if (s === this.STATUS.SNATCHED_GULL) return 'gull';
        return null;
    },

    // 상어에게 물려 심해에 빠져 있는가?
    isBittenByShark(p) {
        return this._toStatus(p) === this.STATUS.DEAD_SHARK;
    },

    // 악어 떼에게 물려 수영장에 갇혀 있는가?
    isBittenByGator(p) {
        return this._toStatus(p) === this.STATUS.DEAD_GATOR;
    },

    // 부산갈매기에게 낚아채여 공중에 납치되어 있는가?
    isSnatchedByGull(p) {
        return this._toStatus(p) === this.STATUS.SNATCHED_GULL;
    },

    // 폭탄 폭발에 맞아 그을림 기절 중인가?
    isHitByBomb(p) {
        return this._toStatus(p) === this.STATUS.DEAD_BOMB;
    },

    // 염전에 납치되어 소금 채취 중인가?
    isAtSaltFarm(p) {
        return this._toStatus(p) === this.STATUS.SALT_FARM;
    },

    // 결투장 링 위에서 결투 중인가?
    isDueling(p) {
        return this._toStatus(p) === this.STATUS.DUELING;
    },

    // 결투에서 패배하여 눈탱이 밤탱이 상태로 기절 중인가?
    isKnockedOutByDuel(p) {
        return this._toStatus(p) === this.STATUS.DEAD_DUEL;
    },

    // [4. 기절 / 행동 불능 상태 체크]
    // 공격을 받거나 동물에게 잡혀 기절 중(채팅/일반행동 불가)인가?
    isIncapacitated(p) {
        return this.INCAPACITATED_STATUSES.includes(this._toStatus(p));
    },

    // [5. 룰 & 상호작용 가능 여부 체크]
    // 미사일의 공격 타깃이 될 수 있는가? (물리적으로 의자 자리에 착석 중인 플레이어만 조준 가능 — 미사일 기절 중첩 허용)
    canBeTargetedByMissile(p) {
        return this.isSeated(p);
    },

    // 폭탄해체하기 아이템의 타깃이 될 수 있는가? (건강하게 착석 중이며 현재 진행 중인 폭탄이 없는 대상)
    canBeTargetedByBomb(p) {
        return this.isHealthySeated(p) && !(p && typeof p === 'object' && p.activeBomb);
    },

    // 염전으로 보내기 아이템의 타깃이 될 수 있는가? (현재 염전 노역 중이 아니며 탈락/대기 중이 아닌 상대 — 랜덤 타이머 시점에 재검증)
    canBeTargetedBySaltFarm(p) {
        return !this.isAtSaltFarm(p) && !this.isDueling(p) && !(p && typeof p === 'object' && (p.saltFarm || p.activeDuel));
    },

    // 결투신청 아이템의 타깃이 될 수 있는가? (건강하게 착석 중이며 폭탄/결투 진행 중이 아닌 대상)
    canBeTargetedByDuel(p) {
        return this.isHealthySeated(p) && !(p && typeof p === 'object' && (p.activeBomb || p.activeDuel));
    },

    // 채팅을 전송할 수 있는 상태인가? (기절하지 않았고 좌석을 이탈하지 않은 상태)
    canChat(p) {
        return !this.isIncapacitated(p) && !this.isAway(p);
    },

    // 공격/행동형 아이템(미사일, 동물소환 등)을 사용할 수 있는 상태인가?
    canUseActionItems(p) {
        return this.isHealthySeated(p);
    },

    // 상태 명칭 한글 레이블 (디버그, 로그, UI 표시용)
    getKoreanLabel(p) {
        const s = this._toStatus(p);
        switch (s) {
            case this.STATUS.IDLE: return '착석 (대기)';
            case this.STATUS.FLYING: return '이탈 (비행 중)';
            case this.STATUS.SWIMMING: return '이탈 (수영 중)';
            case this.STATUS.WALKING: return '이탈 (복귀 중)';
            case this.STATUS.DEAD_SHARK: return '이탈 (상어에게 물림)';
            case this.STATUS.DEAD_GATOR: return '이탈 (악어에게 물림)';
            case this.STATUS.SNATCHED_GULL: return '이탈 (갈매기에게 납치됨)';
            case this.STATUS.DEAD_MISSILE: return '착석 (미사일 기절)';
            case this.STATUS.DEAD_BOMB: return '착석 (폭탄 피격)';
            case this.STATUS.SALT_FARM: return '이탈 (염전 소금 채취 중)';
            case this.STATUS.DUELING: return '이탈 (결투장 결투 중)';
            case this.STATUS.DEAD_DUEL: return '착석 (결투 패배 기절)';
            default: return '알 수 없음';
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlayerState;
}
if (typeof window !== 'undefined') {
    window.PlayerState = PlayerState;
}
