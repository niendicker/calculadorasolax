-- Replace compound unique(source_file, solution_code) with unique(solution_code).
-- This guarantees no two approved solutions share the same combination code
-- regardless of origin (generated vs manually created).

-- Remove duplicate solution_code rows before adding the new constraint.
-- When duplicates exist, keep the generated-rules version; otherwise keep the
-- most recently created row.
delete from approved_solutions
where id in (
  select id from (
    select id,
      row_number() over (
        partition by solution_code
        order by
          case when source_file = 'generated-rules' then 0 else 1 end,
          created_at desc,
          id desc
      ) as rn
    from approved_solutions
  ) ranked
  where rn > 1
);

-- Drop old compound constraint.
alter table approved_solutions
  drop constraint if exists approved_solutions_source_file_solution_code_key;

-- Add constraint on solution_code alone.
alter table approved_solutions
  add constraint approved_solutions_solution_code_key unique (solution_code);
