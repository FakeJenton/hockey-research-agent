-- Career totals per skater across every ingested season (1917-18 onward).
-- Rate stats aggregate only over the seasons where the underlying stat was
-- tracked (shots from 1959-60, hits/blocks from the modern era), because
-- the staging layer nulls untracked-era values.
with seasons as (
    select * from {{ ref('mart_player_season') }}
),

latest_identity as (
    select
        player_id,
        full_name,
        position_code,
        position_group,
        team_abbrevs,
        birth_date
    from seasons
    qualify row_number() over (partition by player_id order by season_id desc) = 1
)

select
    seasons.player_id,
    latest_identity.full_name,
    latest_identity.position_code,
    latest_identity.position_group,
    latest_identity.team_abbrevs as last_team_abbrevs,
    latest_identity.birth_date,
    count(*) as seasons_played,
    min(seasons.season_id) as first_season_id,
    max(seasons.season_id) as last_season_id,
    max(seasons.season_id) = 20252026 as is_active,
    sum(seasons.games_played) as games_played,
    sum(seasons.goals) as goals,
    sum(seasons.assists) as assists,
    sum(seasons.points) as points,
    round(safe_divide(sum(seasons.points), sum(seasons.games_played)), 3) as points_per_gp,
    sum(seasons.shots) as shots,
    -- goals from shot-tracked seasons only, so the ratio is internally consistent
    round(safe_divide(sum(if(seasons.shots is not null, seasons.goals, null)), sum(seasons.shots)), 4) as shooting_pct,
    sum(seasons.pp_goals) as pp_goals,
    sum(seasons.pp_points) as pp_points,
    sum(seasons.sh_goals) as sh_goals,
    sum(seasons.game_winning_goals) as game_winning_goals,
    sum(seasons.pim) as pim,
    sum(seasons.plus_minus) as plus_minus,
    sum(seasons.hits) as hits,
    sum(seasons.blocked_shots) as blocked_shots
from seasons
inner join latest_identity using (player_id)
group by
    seasons.player_id,
    latest_identity.full_name,
    latest_identity.position_code,
    latest_identity.position_group,
    latest_identity.team_abbrevs,
    latest_identity.birth_date
