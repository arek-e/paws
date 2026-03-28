# V1FleetWorkersGet200Response

## Properties

| Name        | Type                                                                                              | Description | Notes |
| ----------- | ------------------------------------------------------------------------------------------------- | ----------- | ----- |
| **workers** | [**List[V1FleetWorkersGet200ResponseWorkersInner]**](V1FleetWorkersGet200ResponseWorkersInner.md) |             |

## Example

```python
from paws_client.models.v1_fleet_workers_get200_response import V1FleetWorkersGet200Response

# TODO update the JSON string below
json = "{}"
# create an instance of V1FleetWorkersGet200Response from a JSON string
v1_fleet_workers_get200_response_instance = V1FleetWorkersGet200Response.from_json(json)
# print the JSON string representation of the object
print(V1FleetWorkersGet200Response.to_json())

# convert the object into a dict
v1_fleet_workers_get200_response_dict = v1_fleet_workers_get200_response_instance.to_dict()
# create an instance of V1FleetWorkersGet200Response from a dict
v1_fleet_workers_get200_response_from_dict = V1FleetWorkersGet200Response.from_dict(v1_fleet_workers_get200_response_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
