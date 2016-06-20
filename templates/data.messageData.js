dataLoaded([
  {% for message in messages -%}
    {i:{{ message._id | JSON_stringify }},p:{{ message.prevInTime | JSON_stringify }},n:{{ message.nextInTime | JSON_stringify }},b:{{ message.messageBody | JSON_stringify }}}{% if not loop.last %},{% endif %}
  {% endfor %}]);
