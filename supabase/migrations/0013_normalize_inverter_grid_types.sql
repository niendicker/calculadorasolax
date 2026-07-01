-- Normalize inverter grid type acronyms stored in the catalog.

update inverters
set grid_types = coalesce(
  (
    select array_agg(distinct normalized_grid_type order by normalized_grid_type)
    from unnest(grid_types) as grid_type
    cross join lateral (
      values (
        case trim(grid_type)
          when 'singlePhase_220' then '1P_220V'
          when 'splitPhase_220' then '2P_220V'
          when 'threePhase_220' then '3P_220V'
          when 'threePhase_380' then '3P_380V'
          when '1p_220V' then '1P_220V'
          when '2p_220V' then '2P_220V'
          when '3p_220V' then '3P_220V'
          when '3p_380V' then '3P_380V'
          when '1P_220V' then '1P_220V'
          when '2P_220V' then '2P_220V'
          when '3P_220V' then '3P_220V'
          when '3P_380V' then '3P_380V'
          else null
        end
      )
    ) as normalized(normalized_grid_type)
    where normalized_grid_type is not null
  ),
  '{}'::text[]
);
