# V1DaemonsPost201Response

## Properties

| Name           | Type         | Description | Notes |
| -------------- | ------------ | ----------- | ----- |
| **role**       | **str**      |             |
| **status**     | **str**      |             |
| **created_at** | **datetime** |             |

## Example

```python
from paws_client.models.v1_daemons_post201_response import V1DaemonsPost201Response

# TODO update the JSON string below
json = "{}"
# create an instance of V1DaemonsPost201Response from a JSON string
v1_daemons_post201_response_instance = V1DaemonsPost201Response.from_json(json)
# print the JSON string representation of the object
print(V1DaemonsPost201Response.to_json())

# convert the object into a dict
v1_daemons_post201_response_dict = v1_daemons_post201_response_instance.to_dict()
# create an instance of V1DaemonsPost201Response from a dict
v1_daemons_post201_response_from_dict = V1DaemonsPost201Response.from_dict(v1_daemons_post201_response_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
