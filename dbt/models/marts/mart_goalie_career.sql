-- Career totals per goalie across every ingested season. Save percentage
-- aggregates only over shot-tracked seasons; career GAA is intentionally
-- omitted (minutes are not tracked for older eras, so a career GAA would
-- silently cover only part of a career).
with seasons as (
    select * from {{ ref('mart_goalie_season') }}
),

latest_identity as (
    select
        player_id,
        full_name,
        team_abbrevs,
        birth_date
    from seasons
    qualify row_number() over (partition by player_id order by season_id desc) = 1
)

select
    seasons.player_id,
    latest_identity.full_name,
    'G' as position_group,
    latest_identity.team_abbrevs as last_team_abbrevs,
    latest_identity.birth_date,
    count(*) as seasons_played,
    min(seasons.season_id) as first_season_id,
    max(seasons.season_id) as last_season_id,
    max(seasons.season_id) = 20252026 as is_active,
    sum(seasons.games_played) as games_played,
    sum(seasons.games_started) as games_started,
    sum(seasons.wins) as wins,
    sum(seasons.losses) as losses,
    sum(seasons.ot_losses) as ot_losses,
    sum(seasons.shutouts) as shutouts,
    sum(seasons.saves) as saves,
    sum(seasons.shots_against) as shots_against,
    round(safe_divide(sum(seasons.saves), sum(seasons.shots_against)), 4) as save_pct
from seasons
inner join latest_identity using (player_id)
group by
    seasons.player_id,
    latest_identity.full_name,
    latest_identity.team_abbrevs,
    latest_identity.birth_date
