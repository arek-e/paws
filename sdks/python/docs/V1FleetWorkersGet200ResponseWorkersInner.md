# V1FleetWorkersGet200ResponseWorkersInner

## Properties

| Name         | Type                                                                                                        | Description | Notes |
| ------------ | ----------------------------------------------------------------------------------------------------------- | ----------- | ----- |
| **name**     | **str**                                                                                                     |             |
| **status**   | **str**                                                                                                     |             |
| **capacity** | [**V1FleetWorkersGet200ResponseWorkersInnerCapacity**](V1FleetWorkersGet200ResponseWorkersInnerCapacity.md) |             |
| **snapshot** | [**V1FleetWorkersGet200ResponseWorkersInnerSnapshot**](V1FleetWorkersGet200ResponseWorkersInnerSnapshot.md) |             |
| **uptime**   | **int**                                                                                                     |             |

## Example

```python
from paws_client.models.v1_fleet_workers_get200_response_workers_inner import V1FleetWorkersGet200ResponseWorkersInner

# TODO update the JSON string below
json = "{}"
# create an instance of V1FleetWorkersGet200ResponseWorkersInner from a JSON string
v1_fleet_workers_get200_response_workers_inner_instance = V1FleetWorkersGet200ResponseWorkersInner.from_json(json)
# print the JSON string representation of the object
print(V1FleetWorkersGet200ResponseWorkersInner.to_json())

# convert the object into a dict
v1_fleet_workers_get200_response_workers_inner_dict = v1_fleet_workers_get200_response_workers_inner_instance.to_dict()
# create an instance of V1FleetWorkersGet200ResponseWorkersInner from a dict
v1_fleet_workers_get200_response_workers_inner_from_dict = V1FleetWorkersGet200ResponseWorkersInner.from_dict(v1_fleet_workers_get200_response_workers_inner_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
