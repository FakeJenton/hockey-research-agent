{#- Use custom schema names verbatim (nhl_stg, nhl_marts) instead of dbt's
    default "<target_schema>_<custom>" concatenation, so datasets match the
    warehouse layout exactly. -#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
