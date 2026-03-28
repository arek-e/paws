# V1FleetGet200Response

## Properties

| Name                | Type    | Description | Notes |
| ------------------- | ------- | ----------- | ----- |
| **total_workers**   | **int** |             |
| **healthy_workers** | **int** |             |
| **total_capacity**  | **int** |             |
| **used_capacity**   | **int** |             |
| **queued_sessions** | **int** |             |
| **active_daemons**  | **int** |             |
| **active_sessions** | **int** |             |

## Example

```python
from paws_client.models.v1_fleet_get200_response import V1FleetGet200Response

# TODO update the JSON string below
json = "{}"
# create an instance of V1FleetGet200Response from a JSON string
v1_fleet_get200_response_instance = V1FleetGet200Response.from_json(json)
# print the JSON string representation of the object
print(V1FleetGet200Response.to_json())

# convert the object into a dict
v1_fleet_get200_response_dict = v1_fleet_get200_response_instance.to_dict()
# create an instance of V1FleetGet200Response from a dict
v1_fleet_get200_response_from_dict = V1FleetGet200Response.from_dict(v1_fleet_get200_response_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
