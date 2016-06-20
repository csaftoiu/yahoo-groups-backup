dataLoaded([
  {% for message in messages -%}
    {s:{{ message.subject | JSON_stringify }},a:{{ get_display_name(message, include_email=False) | JSON_stringify }},d:{{ message.postDate | JSON_stringify }},i:{{ message._id | JSON_stringify }}}{% if not loop.last %},{% endif %}
  {% endfor %}]);
