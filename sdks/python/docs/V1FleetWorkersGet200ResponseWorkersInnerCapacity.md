# V1FleetWorkersGet200ResponseWorkersInnerCapacity


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**max_concurrent** | **int** |  | 
**running** | **int** |  | 
**queued** | **int** |  | 
**available** | **int** |  | 

## Example

```python
from paws_client.models.v1_fleet_workers_get200_response_workers_inner_capacity import V1FleetWorkersGet200ResponseWorkersInnerCapacity

# TODO update the JSON string below
json = "{}"
# create an instance of V1FleetWorkersGet200ResponseWorkersInnerCapacity from a JSON string
v1_fleet_workers_get200_response_workers_inner_capacity_instance = V1FleetWorkersGet200ResponseWorkersInnerCapacity.from_json(json)
# print the JSON string representation of the object
print(V1FleetWorkersGet200ResponseWorkersInnerCapacity.to_json())

# convert the object into a dict
v1_fleet_workers_get200_response_workers_inner_capacity_dict = v1_fleet_workers_get200_response_workers_inner_capacity_instance.to_dict()
# create an instance of V1FleetWorkersGet200ResponseWorkersInnerCapacity from a dict
v1_fleet_workers_get200_response_workers_inner_capacity_from_dict = V1FleetWorkersGet200ResponseWorkersInnerCapacity.from_dict(v1_fleet_workers_get200_response_workers_inner_capacity_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


