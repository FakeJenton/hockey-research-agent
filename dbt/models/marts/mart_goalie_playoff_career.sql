-- Career PLAYOFF totals per goalie across all ingested seasons.
with seasons as (
    select * from {{ ref('mart_goalie_playoff_season') }}
),

latest_identity as (
    select
        player_id,
        full_name
    from seasons
    qualify row_number() over (partition by player_id order by season_id desc) = 1
)

select
    seasons.player_id,
    latest_identity.full_name,
    'G' as position_group,
    count(*) as playoff_seasons,
    min(seasons.season_id) as first_season_id,
    max(seasons.season_id) as last_season_id,
    sum(seasons.games_played) as games_played,
    sum(seasons.wins) as wins,
    sum(seasons.losses) as losses,
    sum(seasons.shutouts) as shutouts,
    sum(seasons.saves) as saves,
    sum(seasons.shots_against) as shots_against,
    round(safe_divide(sum(seasons.saves), sum(seasons.shots_against)), 4) as save_pct
from seasons
inner join latest_identity using (player_id)
group by seasons.player_id, latest_identity.full_name
