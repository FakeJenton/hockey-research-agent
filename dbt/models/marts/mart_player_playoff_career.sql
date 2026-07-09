-- Career PLAYOFF totals per skater across all ingested seasons.
with seasons as (
    select * from {{ ref('mart_player_playoff_season') }}
),

latest_identity as (
    select
        player_id,
        full_name,
        position_code,
        position_group
    from seasons
    qualify row_number() over (partition by player_id order by season_id desc) = 1
)

select
    seasons.player_id,
    latest_identity.full_name,
    latest_identity.position_code,
    latest_identity.position_group,
    count(*) as playoff_seasons,
    min(seasons.season_id) as first_season_id,
    max(seasons.season_id) as last_season_id,
    sum(seasons.games_played) as games_played,
    sum(seasons.goals) as goals,
    sum(seasons.assists) as assists,
    sum(seasons.points) as points,
    round(safe_divide(sum(seasons.points), sum(seasons.games_played)), 3) as points_per_gp,
    sum(seasons.game_winning_goals) as game_winning_goals,
    sum(seasons.pim) as pim
from seasons
inner join latest_identity using (player_id)
group by
    seasons.player_id,
    latest_identity.full_name,
    latest_identity.position_code,
    latest_identity.position_group
